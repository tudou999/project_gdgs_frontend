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
const showSkeleton = ref(false); // 是否显示骨架屏（加载超过300ms时显示）
let skeletonTimer = null; // 骨架屏延迟显示定时器
const typingBuffer = ref(""); // 打字机效果缓冲区，保存尚未输出到界面的内容
let typingTimer = null; // 打字机定时器句柄，用于逐字符刷新界面
let currentTaskId = null; // 当前对话对应的后端任务 ID，用于手动停止
let lastReceivedChunkId = null; // 最后收到的 SSE chunk ID，用于断点续传
const SSE_RESUME_INFO_KEY = "sseResumeInfo";
const activeAssistantMessage = ref(null); // 正在流式输出的 AI 消息对象

// 流式对话缓存：切换对话时保存正在进行的流式状态，以便切换回来时恢复
// key: sessionId, value: { activeMessage, typingBuffer, taskId, isStreaming }
const streamingCacheMap = new Map();
const isWaitingForChunk = computed(
  () => isStreaming.value && typingBuffer.value.length === 0,
); // 是否在等待下一段流式响应

// 会话提升状态
const isPromotingFromLocal = ref(false); // 是否正在从本地临时会话提升到真实会话
let pendingResumeInfo = null; // 待处理的缓存信息（在挂载时读取，在 watch 中执行）
let loadChatAbortController = null; // 用于取消旧的 loadChat 请求

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

const isInitialLoading = ref(false); // 是否正在加载当前会话的第一页
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
  console.log("🚀🚀🚀🚀");
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
    chatAPI.subscribeChatStream({
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

        // 检查是否已切换到其他对话，如果是则写入缓存
        if (String(props.chatId) !== String(sid)) {
          const cache = streamingCacheMap.get(String(sid));
          if (cache) {
            cache.typingBuffer += chunk;
          }
          return;
        }

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
        // 检查是否已切换到其他对话
        if (String(props.chatId) !== String(sid)) {
          // 标记缓存中的流式已完成
          const cache = streamingCacheMap.get(String(sid));
          if (cache) {
            cache.isStreaming = false;
            cache.streamHandle = null;
          }
          return;
        }

        isStreaming.value = false;
        if (!typingBuffer.value.length && typingTimer) {
          clearInterval(typingTimer);
          typingTimer = null;
        }
        currentTaskId = null;
      },
      onError(err) {
        // 检查是否已切换到其他对话
        if (String(props.chatId) !== String(sid)) {
          // 标记缓存中的流式已完成（出错）
          const cache = streamingCacheMap.get(String(sid));
          if (cache) {
            cache.isStreaming = false;
            cache.streamHandle = null;
          }
          console.error("流式请求出错:", err);
          return;
        }

        isStreaming.value = false;
        if (!typingBuffer.value.length && typingTimer) {
          clearInterval(typingTimer);
          typingTimer = null;
        }
        console.error("流式请求出错:", err);
        currentTaskId = null;
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

  chatAPI.subscribeChatStream({
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

    // 3）如果当前正在流式输出，将状态保存到缓存（SSE继续运行，内容写入缓存）
    if (isStreaming.value && oldId) {
      // 保存当前流式状态到缓存（只保存正在流式的AI消息，不保存整个消息列表）
      streamingCacheMap.set(String(oldId), {
        activeMessage: activeAssistantMessage.value, // 正在流式的AI消息对象
        typingBuffer: typingBuffer.value,
        taskId: currentTaskId,
        isStreaming: true,
      });

      // 清理当前界面的流式状态（但不停止SSE）
      isStreaming.value = false;
      typingBuffer.value = "";
      if (typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
      }
      activeAssistantMessage.value = null;
      currentTaskId = null;
    }

    // 4）立即清空当前对话记录，避免网络卡顿时显示旧对话
    resetChatView();

    // 5）设置骨架屏延迟显示（300ms后如果还在加载则显示）
    if (skeletonTimer) {
      clearTimeout(skeletonTimer);
    }
    skeletonTimer = setTimeout(() => {
      showSkeleton.value = true;
    }, 300);

    // 6）加载历史记录
    await loadChat(newId);

    // 7）加载完成，清除骨架屏
    if (skeletonTimer) {
      clearTimeout(skeletonTimer);
      skeletonTimer = null;
    }
    showSkeleton.value = false;

    // 8）检查是否有缓存的流式状态，有则把缓存的AI消息追加到末尾继续流式
    const cachedState = streamingCacheMap.get(String(newId));
    if (cachedState) {
      // 从缓存中取出正在流式的AI消息
      const cachedActiveMsg = cachedState.activeMessage;

      if (cachedActiveMsg) {
        // 把缓存中已收到的内容（包括缓冲区）一次性全部显示
        // 将缓冲区内容直接追加到消息内容中
        cachedActiveMsg.content += cachedState.typingBuffer;

        // 把AI消息追加到当前消息列表末尾
        currentMessages.value.push(cachedActiveMsg);
        activeAssistantMessage.value = cachedActiveMsg;
      }

      // 恢复流式相关状态（缓冲区清空，因为已经一次性显示了）
      typingBuffer.value = "";
      currentTaskId = cachedState.taskId;
      isStreaming.value = cachedState.isStreaming;

      // 如果还在流式中，启动打字机定时器接收后续新内容
      if (isStreaming.value) {
        if (!typingTimer) {
          typingTimer = setInterval(() => {
            if (!typingBuffer.value.length) {
              if (!isStreaming.value) {
                clearInterval(typingTimer);
                typingTimer = null;
                activeAssistantMessage.value = null;
                streamingCacheMap.delete(String(newId));
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
      }

      // 清除缓存
      streamingCacheMap.delete(String(newId));

      await nextTick();
      await scrollToBottom(true);
      return;
    }

    // 9）加载完成后，检查是否需要续传（页面刷新场景）
    if (pendingResumeInfo) {
      const { taskId, sessionId, lastChunkId, content } = pendingResumeInfo;
      if (taskId && sessionId && String(sessionId) === String(newId)) {
        resumeStream(taskId, sessionId, lastChunkId, content);
      }
      pendingResumeInfo = null;
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
  if (skeletonTimer) {
    clearTimeout(skeletonTimer);
    skeletonTimer = null;
  }
  // 组件正常卸载时也保存续传信息
  saveResumeInfo();
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
