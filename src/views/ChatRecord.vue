<script setup>
// TODO：UI界面优化
// TODO：将缓存信息存到 IndexedDB，避免 localStorage 容量限制问题
// TODO：切换对话的时候停止按钮还是显示停止，排查bug
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { Position } from "@element-plus/icons-vue";
import ChatMessage from "../components/ChatMessage.vue";
import { chatAPI } from "../services/sessions.js";
import IconStop from "../components/icons/IconStop.vue";
import { ElMessage } from "element-plus";
import { ChatMode } from "../interface/Tchat.ts";
import { messageCache } from "../utils/UtilMessageCache.ts";

defineOptions({
  name: "ChatRecord",
});

const props = defineProps({
  chatId: {
    type: String,
    default: null,
  },
  isNewChat: {
    type: Boolean,
    default: false,
  },
});

// 事件：会话创建成功/会话被选中
const emit = defineEmits(["chat-created"]);

// 本地 UI 与分页状态
const messagesRef = ref(null); // 消息列表容器，用于滚动控制和无限加载
const userInput = ref(""); // 文本输入框绑定的用户输入
const isStreaming = ref(false); // 当前是否在流式输出中，控制按钮禁用等
const currentMessages = ref([]); // 当前会话下展示的消息数组
const autoScrollEnabled = ref(true); // 是否允许自动滚动到底部（用户不阅读历史时）
const pageNum = ref(1); // 当前分页页码，用于向后端请求更多历史
const pageSize = ref(10); // 每页条数
const total = ref(0); // 当前会话消息总数
const loadingMore = ref(false); // 是否正在加载上一页历史，避免重复请求
const hasMore = ref(true); // 是否还有更多历史可加载
const showSkeleton = ref(false); // 是否显示骨架屏（加载超过300ms时显示）
let skeletonTimer = null; // 骨架屏延迟显示定时器
const typingBuffer = ref(""); // 打字机效果缓冲区，保存尚未输出到界面的内容
let typingTimer = null; // 打字机定时器句柄，用于逐字符刷新界面
let lastReceivedChunkId = null; // 最后收到的 SSE chunk ID，用于断点续传
const activeAssistantMessage = ref(null); // 正在流式输出的 AI 消息对象

const isWaitingForChunk = computed(
  () => isStreaming.value && typingBuffer.value.length === 0,
); // 是否在等待下一段流式响应

// 会话提升状态
const isPromotingFromLocal = ref(false); // 是否正在从本地临时会话提升到真实会话
let loadChatAbortController = null; // 用于取消旧的 loadChat 请求
let sessionSseHandle = null; // 当前会话的SSE连接句柄，用于监听实时消息

// 模式（本地/在线）（false表示本地，true表示在线）
const mode = ref(false);

// 重置分页状态
function resetPagination() {
  pageNum.value = 1;
  total.value = 0;
  hasMore.value = true;
}

// 清理流式状态
const clearStreamingState = () => {
  isStreaming.value = false;
  if (typingTimer) {
    clearInterval(typingTimer);
    typingTimer = null;
  }

  activeAssistantMessage.value = null;
  typingBuffer.value = "";
};

// 重置聊天记录与分页状态
function resetChatView() {
  currentMessages.value = [];
  resetPagination();
}

const isInitialLoading = ref(false); // 是否正在加载当前会话的第一页
// 建立当前会话的SSE连接，监听实时消息
function subscribeToSession(sessionId, sessionCache) {
  let sessionSseArchived = false;
  let cacheApplied = false; // 标记缓存是否已应用

  // 解析缓存数据
  let cachedContent = "";
  let lastChunkId = null;
  if (sessionCache) {
    const cacheData = sessionCache;
    cachedContent = cacheData.content || "";
    lastChunkId = cacheData.lastChunkId || null;
  }

  const newHandle = chatAPI.subscribeChatStream({
    sessionId: sessionId,
    lastChunkId: lastChunkId,
    onId(id) {
      // 已归档
      if (id === "ARCHIVE_FINISHED") {
        sessionSseArchived = true;
        isStreaming.value = false;
        // 清除本地缓存
        messageCache.remove(sessionId);
        newHandle.cancel();
      } else {
        lastReceivedChunkId = id;
      }
    },
    onChunk(rawData) {
      if (sessionSseArchived) return;

      let chunk = JSON.parse(rawData);

      if (typeof chunk !== "string") chunk = String(chunk);
      chunk = chunk.replace(/\r\n/g, "\n");
      chunk = chunk.replace(/^data:\s?/gm, "");

      // 如果没有正在流式的AI消息，创建一个新的
      if (!activeAssistantMessage.value) {
        currentMessages.value.push({
          senderType: "AI",
          content: "",
          stopped: false,
        });
        activeAssistantMessage.value =
          currentMessages.value[currentMessages.value.length - 1];
        isStreaming.value = true;

        // 首次创建气泡时，一次性将缓存内容贴上去
        if (!cacheApplied && cachedContent) {
          activeAssistantMessage.value.content = cachedContent;
          cacheApplied = true;
          nextTick(() => scrollToBottom());
        }
      }

      typingBuffer.value += chunk;

      if (!typingTimer) {
        typingTimer = setInterval(() => {
          if (!typingBuffer.value.length) {
            if (!isStreaming.value) {
              clearInterval(typingTimer);
              typingTimer = null;
              activeAssistantMessage.value = null;
            }
            return;
          }
          const nextChar = typingBuffer.value[0];
          typingBuffer.value = typingBuffer.value.slice(1);
          const msg = activeAssistantMessage.value;
          if (msg) msg.content += nextChar;

          nextTick(() => scrollToBottom());
        }, 20);
      }
    },
    onFinish() {
      // 只有当这个连接确实是当前激活的连接时，才清理全局句柄
      if (sessionSseHandle === newHandle) {
        sessionSseHandle = null;
      }
      // 清理流状态
      isStreaming.value = false;
      if (typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
      }
      activeAssistantMessage.value = null;
      // 流式结束，清除本地缓存
      messageCache.remove(sessionId);
    },
    onError(err) {
      console.error("[SSE] onError 连接出错", err);
      if (sessionSseHandle === newHandle) {
        sessionSseHandle = null;
      }
      isStreaming.value = false;
      if (typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
      }
      activeAssistantMessage.value = null;
      // 出错时也清除本地缓存，避免脏数据
      messageCache.remove(sessionId);
    },
  });

  // 更新全局句柄
  sessionSseHandle = newHandle;
}

// 加载指定会话的消息列表
async function loadChat(chatId) {
  // 取消之前的请求，避免旧请求覆盖新请求的结果
  if (loadChatAbortController) {
    loadChatAbortController.abort();
  }
  loadChatAbortController = new AbortController();
  const signal = loadChatAbortController.signal;

  // 重置分页状态
  isInitialLoading.value = true;
  resetPagination();
  try {
    // 加载第一页消息
    const response = await chatAPI.getChatMessagesByPage(
      chatId,
      pageNum.value,
      pageSize.value,
      signal,
    );

    const pageData = response.data || {};
    let records = Array.isArray(pageData.records) ? pageData.records : [];

    if (Array.isArray(records)) {
    } else if (records) {
      records = [records]; // 单个对象 => 单元素数组
    } else {
      records = [];
    }

    // 接口按创建时间倒序返回，这里翻转成正序显示
    currentMessages.value = [...records].reverse();
    total.value = pageData.total || 0;
    hasMore.value = pageNum.value * pageSize.value < total.value;

    await nextTick();
    await scrollToBottom(true);
  } catch (error) {
    // 如果是主动取消的请求，不做处理
    if (error?.name === "CanceledError" || signal.aborted) {
      return;
    }
    console.error("加载对话消息失败:", error);
    currentMessages.value = [];
  } finally {
    isInitialLoading.value = false;
  }
}

// 加载更多历史消息（无限滚动）
async function loadMoreMessages() {
  if (loadingMore.value || !hasMore.value || !props.chatId) return;
  loadingMore.value = true;

  try {
    // 获得 messages 容器
    const container = messagesRef.value;
    // 记录加载前的 scrollHeight（内容高度）
    const previousScrollHeight = container ? container.scrollHeight : 0;

    const nextPage = pageNum.value + 1;
    // 调用接口加载下一页消息
    const response = await chatAPI.getChatMessagesByPage(
      props.chatId,
      nextPage,
      pageSize.value,
    );

    const pageData = response.data || {};
    const records = Array.isArray(pageData.records) ? pageData.records : [];

    if (records.length > 0) {
      const newMessages = [...records].reverse();
      currentMessages.value = [...newMessages, ...currentMessages.value];

      pageNum.value = nextPage;
      total.value = pageData.total || total.value;
      hasMore.value = pageNum.value * pageSize.value < total.value;

      // 追加旧消息后保持用户视口位置
      await nextTick();
      if (container) {
        const newScrollHeight = container.scrollHeight;
        container.scrollTop = newScrollHeight - previousScrollHeight;
      }
    } else {
      hasMore.value = false;
    }
  } catch (error) {
    console.error("加载更多消息失败:", error);
  } finally {
    loadingMore.value = false;
  }
}

// 处理回车发送，需与按钮禁用逻辑保持一致
function handleInputEnter() {
  if (isStreaming.value || !userInput.value.trim()) {
    ElMessage.error("当前正在发送信息，请稍后再试！");
    return;
  }
  startStream(userInput.value);
}

// 开始流式发送消息
async function startStream(data) {
  const prompt = (
    typeof data === "string" ? data : userInput.value || ""
  ).trim();
  if (!prompt) return;

  isStreaming.value = true;
  userInput.value = "";
  typingBuffer.value = "";
  if (typingTimer) {
    clearInterval(typingTimer);
    typingTimer = null;
  }

  // 将临时用户消息添加到当前消息列表
  currentMessages.value.push({
    senderType: "USER",
    content: prompt,
  });

  // 将 AI 消息添加到当前消息列表，并记录当前正在流式输出的消息对象
  currentMessages.value.push({
    senderType: "AI",
    content: "",
    stopped: false,
  });
  activeAssistantMessage.value =
    currentMessages.value[currentMessages.value.length - 1];

  if (!data) userInput.value = "";
  // 发送时滚动到底部
  await scrollToBottom(true);

  let sid = props.chatId ?? 0;
  // 如果当前是本地临时会话（id=0），则先创建真实会话
  if (sid == 0) {
    // 标记为正在提升会话
    isPromotingFromLocal.value = true;

    try {
      const title = prompt.slice(0, 12);
      // 创建真实会话并获取刚创建的 ID
      const res = await chatAPI.postCreateSession(title);
      sid = res.data;

      // 通知父组件会话已创建
      emit("chat-created", { id: sid, title: title });
    } catch (error) {
      isPromotingFromLocal.value = false;
      console.error("创建会话失败:", error);
      isStreaming.value = false;
      return;
    }
  }

  try {
    // 发送消息
    await chatAPI.postMessage({
      message: prompt,
      sessionId: sid,
      mode: mode.value ? ChatMode.Online : ChatMode.Local,
    });

    // 订阅sse
    subscribeToSession(sid, null);
  } catch (err) {
    // startChat 或 subscribeChatStream 出错
    isStreaming.value = false;
    if (!typingBuffer.value.length && typingTimer) {
      clearInterval(typingTimer);
      typingTimer = null;
    }
    console.error("发送消息失败:", err);
  }
}

// 停止当前流式输出
function stopStream() {
  chatAPI
    .patchStopMessage(props.chatId)
    .catch((err) => console.error("手动停止对话失败:", err));
  isStreaming.value = false;
  typingBuffer.value = "";
  if (typingTimer) {
    clearInterval(typingTimer);
    typingTimer = null;
  }
  if (activeAssistantMessage.value) {
    const msg = activeAssistantMessage.value;
    msg.stopped = true;
    activeAssistantMessage.value = null;
  }
}

// 重新生成：将选中的用户消息填回输入框并直接重新发送
function handleRegenerate(content) {
  if (!content || isStreaming.value) return;
  userInput.value = content;
  // 直接使用这段内容重新开始一次流式对话
  startStream(content);
}

// 滚动到底部
async function scrollToBottom(force = false) {
  await nextTick();
  const container = messagesRef.value;
  if (!container) return;

  if (!force && !autoScrollEnabled.value) {
    return;
  }

  container.scrollTop = container.scrollHeight;
}

// 监听消息容器滚动事件，实现分页加载/自动滚动控制
function handleMessagesScroll() {
  if (isInitialLoading.value) {
    // 正在加载第一页时，不允许触发“加载更多”
    return;
  }

  const container = messagesRef.value;
  if (!container) return;

  // 规定触发加载的阈值
  const thresholdTop = 10;
  const thresholdBottom = 10;

  // 顶部触发分页加载
  if (
    !loadingMore.value &&
    hasMore.value &&
    container.scrollTop <= thresholdTop
  ) {
    loadMoreMessages();
  }

  // 计算距离底部的距离
  const distanceToBottom =
    container.scrollHeight - (container.scrollTop + container.clientHeight);
  // 当用户滚动到底部附近时，autoScrollEnabled设置为true，启用自动滚动
  // 距离底部 > thresholdBottom 时认为用户在阅读历史，不再强制滚动
  autoScrollEnabled.value = distanceToBottom <= thresholdBottom;
}

// 关闭旧连接
const closeSse = () => {
  if (sessionSseHandle) {
    sessionSseHandle.cancel();
    sessionSseHandle = null;
  }
};
// 组件挂载
onMounted(() => {
  // 监听滚动事件
  if (messagesRef.value) {
    messagesRef.value.addEventListener("scroll", handleMessagesScroll);
  }
});

// 监听：当组件接收到的值改变时，根据该值加载对应会话消息
watch(
  () => props.chatId,
  async (newId, oldId) => {
    // 关闭旧连接 + 保存旧会话缓存
    closeSse();
    if (oldId && isStreaming.value) {
      // 完整内容 = 已渲染 + 打字机缓冲区
      const fullContent =
        activeAssistantMessage.value.content + typingBuffer.value;
      messageCache.save(oldId, fullContent, lastReceivedChunkId);
    }

    // 清理状态
    if (skeletonTimer) clearTimeout(skeletonTimer);
    clearStreamingState();
    resetChatView();

    // 如果进入新对话窗口，return
    if (newId === "0" || newId == null) return;

    // 设置骨架屏 + 加载历史记录
    skeletonTimer = setTimeout(() => {
      showSkeleton.value = true;
    }, 300);
    await loadChat(newId);

    // 加载完成，清除骨架屏
    if (skeletonTimer) {
      clearTimeout(skeletonTimer);
      skeletonTimer = null;
    }
    showSkeleton.value = false;

    // 从本地缓存中读取：sessionId，lastReceivedChunkId
    const sessionCache = messageCache.get(newId);

    // 建立当前会话的SSE连接，监听实时消息
    subscribeToSession(newId, sessionCache);
  },
);

// 组件卸载前
onBeforeUnmount(() => {
  // 卸载前保存当前流式缓存（TODO：刷新页面时保留状态）
  if (props.chatId && isStreaming.value) {
    // 完整内容 = 已渲染 + 打字机缓冲区
    const fullContent =
      activeAssistantMessage.value.content + typingBuffer.value;
    messageCache.save(props.chatId, fullContent, lastReceivedChunkId);
  }

  // 移除滚动事件监听
  if (messagesRef.value) {
    messagesRef.value.removeEventListener("scroll", handleMessagesScroll);
  }
  // 清理定时器
  if (typingTimer) {
    clearInterval(typingTimer);
    typingTimer = null;
  }
  if (skeletonTimer) {
    clearTimeout(skeletonTimer);
    skeletonTimer = null;
  }
  // 关闭会话SSE连接
  if (sessionSseHandle) {
    sessionSseHandle.cancel();
    sessionSseHandle = null;
  }
});
</script>

<template>
  <div class="chat-record">
    <div class="messages" ref="messagesRef">
      <!-- 骨架屏：加载超过300ms时显示，模拟一问一答的对话形式 -->
      <template v-if="showSkeleton">
        <template v-for="i in 2" :key="'skeleton-pair-' + i">
          <!-- 用户消息骨架（右侧） -->
          <div class="skeleton-message skeleton-user">
            <div class="skeleton-bubble">
              <el-skeleton :rows="1" animated />
            </div>
          </div>
          <!-- AI消息骨架（左侧） -->
          <div class="skeleton-message skeleton-ai">
            <div class="skeleton-bubble">
              <el-skeleton :rows="2" animated />
            </div>
          </div>
        </template>
      </template>
      <!-- 消息列表 -->
      <template v-else>
        <ChatMessage
          v-for="(message, index) in currentMessages"
          :key="index"
          :message="{
            role: message.senderType,
            content: message.content,
            stopped: message.stopped,
            createdAt: message.created,
          }"
          :isStreaming="isStreaming"
          :isWaiting="isWaitingForChunk && message === activeAssistantMessage"
          @regenerate="handleRegenerate"
        />
      </template>
    </div>
    <div class="input-area">
      <div class="input-wrapper">
        <div class="input-row">
          <!-- TODO：暂时修改死宽度，后面要优化 -->
          <el-input
            style="max-width: 685px"
            clearable
            size="large"
            type="textarea"
            :autosize="{ minRows: 1, maxRows: 6 }"
            v-model="userInput"
            @keydown.enter.prevent="handleInputEnter"
            placeholder="给 CORS 发送消息"
            resize="none"
          />
          <el-switch
            v-model="mode"
            active-text="在线"
            inactive-text="本地"
            size="large"
          />

          <el-button
            round
            class="send-button"
            @click="isStreaming ? stopStream() : startStream(userInput)"
            :disabled="!isStreaming && !userInput.trim()"
          >
            <template v-if="isStreaming">
              <IconStop class="icon-stop" />
            </template>
            <template v-else>
              <el-icon class="icon-send" size="small"><Position /></el-icon>
            </template>
          </el-button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.chat-record {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.messages {
  flex: 1;
  overflow-y: auto;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 1.5rem;

  > * {
    max-width: 900px;
    width: 100%;
    margin: 0 auto;
  }

  // 骨架屏消息样式，模拟聊天对话形式
  .skeleton-message {
    display: flex;
    max-width: 48rem;
    width: 100%;
    margin: 0 auto;

    .skeleton-bubble {
      padding: 0.75rem 1.25rem;
      border-radius: 1.25rem;
      background: var(--el-bg-color);
    }

    // 用户消息：右对齐，短一点
    &.skeleton-user {
      justify-content: flex-end;

      .skeleton-bubble {
        width: 40%;
        min-width: 120px;
        max-width: 280px;
        background: var(--el-color-primary-light-9);
      }
    }

    // AI消息：左对齐，长一点
    &.skeleton-ai {
      justify-content: flex-start;

      .skeleton-bubble {
        width: 70%;
        min-width: 200px;
        max-width: 500px;
      }
    }
  }
}

.input-area {
  flex-shrink: 0;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;

  .input-wrapper {
    width: 100%;
    max-width: 900px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .input-row {
    display: flex;
    gap: 10px;
    align-items: center;
    background: var(--el-bg-color);
    padding: 0.75rem;
    border-radius: 1.5rem;
    border: 0;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    width: 100%;
    transition:
      border-color 0.2s,
      box-shadow 0.2s;

    &:focus-within {
      border-color: var(--el-border-color-darker);
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.08);
    }

    :deep(.el-input) {
      flex: 1;
    }

    :deep(.el-input__wrapper) {
      background: transparent;
      box-shadow: none;
      border: none;
      padding-left: 0;
      padding-right: 0;
    }

    :deep(.el-input__inner) {
      padding-left: 0;
      padding-right: 0;
    }

    textarea {
      flex: 1;
      resize: none;
      border: none;
      background: transparent;
      padding: 0.25rem 0.5rem;
      color: inherit;
      font-family: inherit;
      font-size: 1rem;
      line-height: 1.5;
      max-height: 200px;

      &:focus {
        outline: none;
      }

      &::placeholder {
        color: var(--el-text-color-placeholder);
      }
    }

    .send-button {
      width: 2rem;
      height: 2rem;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: var(--el-text-color-primary);
      color: var(--el-bg-color);
      cursor: pointer;
      transition: all 0.2s ease;
      flex-shrink: 0;

      &:hover:not(:disabled) {
        background: var(--el-text-color-regular);
      }

      &:disabled {
        background: var(--el-fill-color);
        color: var(--el-text-color-regular);
        cursor: not-allowed;
      }

      .icon-send {
        width: 1.25rem;
        height: 1.25rem;
      }

      .icon-stop {
        width: 1rem;
        height: 1rem;
      }
    }
  }
}
</style>
