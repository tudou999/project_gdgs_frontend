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
import { ChatMode } from "../interface/chat.ts";

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
const typingBuffer = ref(""); // 打字机效果缓冲区，保存尚未输出到界面的内容
let typingTimer = null; // 打字机定时器句柄，用于逐字符刷新界面
let currentTaskId = null; // 当前对话对应的后端任务 ID，用于手动停止
let lastReceivedChunkId = null; // 最后收到的 SSE chunk ID，用于断点续传
const SSE_RESUME_INFO_KEY = "sseResumeInfo";
let activeStreamHandle = null; // 当前 fetchEventSource 句柄，用于取消流式输出
const activeAssistantMessage = ref(null); // 正在流式输出的 AI 消息对象
const isWaitingForChunk = computed(
  () => isStreaming.value && typingBuffer.value.length === 0,
); // 是否在等待下一段流式响应

// 会话提升状态
const isPromotingFromLocal = ref(false); // 是否正在从本地临时会话提升到真实会话
let lastChatId = null;
let pendingResumeInfo = null; // 待处理的缓存信息（在挂载时读取，在 watch 中执行）

// 模式（本地/在线）（false表示本地，true表示在线）
const mode = ref(false);

// 重置分页状态
function resetPagination() {
  pageNum.value = 1;
  total.value = 0;
  hasMore.value = true;
}

// 重置聊天记录与分页状态
function resetChatView() {
  currentMessages.value = [];
  resetPagination();
}

// 加载指定会话的消息列表
async function loadChat(chatId) {
  // 重置分页状态
  resetPagination();
  try {
    // 加载第一页消息
    const response = await chatAPI.getChatMessagesByPage(
      chatId,
      pageNum.value,
      pageSize.value,
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
    console.error("加载对话消息失败:", error);
    currentMessages.value = [];
  }
}

// 加载更多历史消息（上一页）
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
    // 发送消息，拿到 taskId
    const res = await chatAPI.postMessage({
      message: prompt,
      sessionId: sid,
      mode: mode.value ? ChatMode.Online : ChatMode.Local,
    });
    const taskId = res.data.taskId;
    currentTaskId = taskId;

    // 根据 taskId 订阅 SSE 流
    activeStreamHandle = chatAPI.subscribeChatStream({
      taskId: taskId,
      sessionId: sid,
      onChunk(rawData) {
        let chunk = rawData;

        try {
          chunk = JSON.parse(rawData);
        } catch (_) {}

        if (typeof chunk !== "string") chunk = String(chunk);
        chunk = chunk.replace(/\r\n/g, "\n");
        chunk = chunk.replace(/^data:\s?/gm, "");

        typingBuffer.value += chunk;

        if (!typingTimer) {
          typingTimer = setInterval(() => {
            if (!typingBuffer.value.length) {
              if (!isStreaming.value) {
                clearInterval(typingTimer);
                typingTimer = null;
                // 打字机内容已经全部输出完毕，可以安全清理当前流式消息引用
                activeAssistantMessage.value = null;
              }
              return;
            }

            const nextChar = typingBuffer.value[0];
            typingBuffer.value = typingBuffer.value.slice(1);

            const msg = activeAssistantMessage.value;
            if (msg) {
              msg.content += nextChar;
            }

            nextTick(() => scrollToBottom());
          }, 20);
        }
      },
      onChunkId(id) {
        lastReceivedChunkId = id;
      },
      onFinish() {
        isStreaming.value = false;
        if (!typingBuffer.value.length && typingTimer) {
          clearInterval(typingTimer);
          typingTimer = null;
        }
        currentTaskId = null;
        activeStreamHandle = null;
      },
      onError(err) {
        isStreaming.value = false;
        if (!typingBuffer.value.length && typingTimer) {
          clearInterval(typingTimer);
          typingTimer = null;
        }
        console.error("流式请求出错:", err);
        currentTaskId = null;
        activeStreamHandle = null;
      },
    });
  } catch (err) {
    // startChat 或 subscribeChatStream 出错
    isStreaming.value = false;
    if (!typingBuffer.value.length && typingTimer) {
      clearInterval(typingTimer);
      typingTimer = null;
    }
    console.error("启动或订阅聊天流失败:", err);
    activeStreamHandle = null;
  }
}

// 恢复/重建 SSE 连接
function resumeStream(taskId, sessionId, chunkId, initialContent = "") {
  isStreaming.value = true;
  currentTaskId = taskId;

  // 添加一个 AI 消息占位符，用于接收续传内容
  currentMessages.value.push({
    senderType: "AI",
    content: initialContent || "",
    stopped: false,
  });
  activeAssistantMessage.value =
    currentMessages.value[currentMessages.value.length - 1];

  activeStreamHandle = chatAPI.subscribeChatStream({
    taskId: taskId,
    sessionId: sessionId,
    resumeFromChunkId: chunkId,
    onChunk(rawData) {
      let chunk = rawData;
      try {
        chunk = JSON.parse(rawData);
      } catch (_) {}
      if (typeof chunk !== "string") chunk = String(chunk);
      chunk = chunk.replace(/\r\n/g, "\n");
      chunk = chunk.replace(/^data:\s?/gm, "");

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
          if (msg) {
            msg.content += nextChar;
          }
          nextTick(() => scrollToBottom());
        }, 20);
      }
    },
    lastChunkId(id) {
      lastReceivedChunkId = id;
    },
    onFinish() {
      isStreaming.value = false;
      if (!typingBuffer.value.length && typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
      }
      currentTaskId = null;
      activeStreamHandle = null;
      // 流正常结束，清除 localStorage 中的续传信息
      localStorage.removeItem(SSE_RESUME_INFO_KEY);
    },
    onError(err) {
      isStreaming.value = false;
      if (!typingBuffer.value.length && typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
      }
      console.error("流式请求出错:", err);
      currentTaskId = null;
      activeStreamHandle = null;
      // 出错时也清除续传信息，避免反复重试
      localStorage.removeItem(SSE_RESUME_INFO_KEY);
    },
  });
}

// 停止当前流式输出
function stopStream() {
  if (currentTaskId) {
    chatAPI
      .postStopMessage(props.chatId, currentTaskId)
      .catch((err) => console.error("手动停止对话失败:", err));
  }
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
  currentTaskId = null;
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

// 刷新时保存信息
function saveResumeInfo() {
  // 已渲染的内容
  const renderedContent = activeAssistantMessage.value?.content ?? "";
  // 缓冲区中尚未渲染的内容
  const bufferedContent = typingBuffer.value ?? "";
  const fullContent = renderedContent + bufferedContent;

  if (currentTaskId && isStreaming.value) {
    const resumeInfo = {
      taskId: currentTaskId,
      sessionId: props.chatId,
      lastChunkId: lastReceivedChunkId,
      content: fullContent,
    };
    localStorage.setItem(SSE_RESUME_INFO_KEY, JSON.stringify(resumeInfo));
  } else {
    localStorage.removeItem(SSE_RESUME_INFO_KEY);
  }
}

// 组件挂载
onMounted(() => {
  // 读取续传信息，存到 pendingResumeInfo，等 watch 中 loadChat 完成后执行
  const resumeInfoStr = localStorage.getItem(SSE_RESUME_INFO_KEY);

  // 如果有续传信息，解析并存储到 pendingResumeInfo
  if (resumeInfoStr) {
    try {
      const resumeInfo = JSON.parse(resumeInfoStr);
      const { taskId, sessionId, lastChunkId, content } = resumeInfo;

      // 存储待处理的续传信息，等 watch 触发时执行
      pendingResumeInfo = {
        taskId,
        sessionId,
        lastChunkId,
        messageContent: content || "",
      };
    } catch (e) {
      localStorage.removeItem(SSE_RESUME_INFO_KEY);
    }
  }

  // 监听页面刷新/关闭事件
  window.addEventListener("beforeunload", saveResumeInfo);

  // 监听滚动事件
  if (messagesRef.value) {
    messagesRef.value.addEventListener("scroll", handleMessagesScroll);
  }
});

// 监听：当组件接收到的值改变时，根据该值加载对应会话消息
watch(
  () => props.chatId,
  async (newId, oldId) => {
    // 记录上一次 id，方便调试/条件判断
    lastChatId = oldId;

    // 1）新值为 0：表示又回到本地临时会话，直接重置即可
    if (newId == 0 || newId == null) {
      resetChatView();
      return;
    }

    // 2）如果是从 0 升级到真实 id，并且当前在流式输出，说明我们已经有本地的临时消息了，
    //    不需要立刻用后端覆盖，等用户下一次真正切换会话时再 load 即可
    if (oldId == 0 && isPromotingFromLocal.value && isStreaming.value) {
      // 这次变更只用于“记录真实 id”，不触发 loadChat
      isPromotingFromLocal.value = false;
      return;
    }

    // TODO：这里要改成切换会话不冲突
    // 3）如果当前正在流式输出，不要重复加载
    if (isStreaming.value) {
      return;
    }

    // 4）普通情况：正常根据 newId 加载会话
    await loadChat(newId);

    // 5）加载完成后，检查是否需要续传
    if (pendingResumeInfo) {
      const { taskId, sessionId, lastChunkId, content } = pendingResumeInfo;
      if (taskId && sessionId && String(sessionId) === String(newId)) {
        resumeStream(taskId, sessionId, lastChunkId, content);
      } else {
        localStorage.removeItem(SSE_RESUME_INFO_KEY);
      }
      pendingResumeInfo = null; // 清除，只执行一次
    }
  },
);

// 组件卸载前
onBeforeUnmount(() => {
  // 移除页面刷新/关闭事件监听
  window.removeEventListener("beforeunload", saveResumeInfo);

  // 移除滚动事件监听
  if (messagesRef.value) {
    messagesRef.value.removeEventListener("scroll", handleMessagesScroll);
  }
  // 清理定时器
  if (typingTimer) {
    clearInterval(typingTimer);
    typingTimer = null;
  }
  // 组件正常卸载时也保存续传信息
  saveResumeInfo();
});
</script>

<template>
  <div class="chat-record">
    <div class="messages" ref="messagesRef">
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
    </div>
    <div class="input-area">
      <div class="input-wrapper">
        <div class="input-row">
          <!-- TODO：暂时修改宽度，后面要优化 -->
          <el-input
            style="max-width: 550px"
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
    max-width: 48rem;
    width: 100%;
    margin: 0 auto;
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
    max-width: 48rem;
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
