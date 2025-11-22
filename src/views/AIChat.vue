<template>
  <el-container class="ai-chat">
    <el-container class="chat-container">
      <!-- 侧边栏 -->
      <el-aside class="sidebar">
        <div class="history-header">
          <h2>聊天记录</h2>
          <el-button
            size="large"
            @click="startNewChat(currentChatId)"
            type="primary"
          >
            <el-icon>
              <ChatDotSquare />
            </el-icon>
            新对话
          </el-button>
        </div>
        <div class="history-list">
          <div
            v-for="chat in chatHistory"
            :key="chat.id"
            class="history-item"
            :class="{ active: currentChatId === chat.id }"
            @click="chat.editing === 0 ? loadChat(chat.id) : null"
          >
            <ChatBubbleLeftRightIcon class="icon" />

            <span v-if="chat.editing === 0" class="title">
              {{ chat.title || "新对话" }}
            </span>

            <div v-else class="rename-editing">
              <el-input
                ref="refInput"
                v-model="chat.title"
                size="default"
                placeholder="请输入新标题"
                clearable
                @keydown.enter.stop.prevent="confirmRename(chat)"
                :disabled="renamingId && renamingId !== chat.id"
                class="rename-input"
              />
              <el-button
                type="primary"
                size="small"
                @click="confirmRename(chat)"
                :loading="renamingId === chat.id"
                :disabled="renamingId && renamingId !== chat.id"
                class="rename-confirm-btn"
              >
                <el-icon><Check /></el-icon>
              </el-button>
              <el-button
                size="small"
                @click="cancelRename(chat)"
                :disabled="renamingId && renamingId !== chat.id"
                class="rename-cancel-btn"
              >
                <el-icon><Close /></el-icon>
              </el-button>
            </div>

            <span class="actions">
              <el-dropdown size="large" trigger="click">
                <el-button :disabled="isAnyEditing && chat.editing === 0">
                  <el-icon>
                    <More />
                  </el-icon>
                </el-button>

                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="renameSession(chat)"
                      >重命名会话</el-dropdown-item
                    >
                    <el-dropdown-item
                      @click="deleteSession(chat.id, chat.title)"
                      >删除会话</el-dropdown-item
                    >
                  </el-dropdown-menu>
                </template>
              </el-dropdown>
            </span>
          </div>
        </div>
      </el-aside>

      <!-- 主区域 -->
      <el-main class="chat-main">
        <div class="messages" ref="messagesRef">
          <ChatMessage
            v-for="(message, index) in currentMessages"
            :key="index"
            :message="{
              role: message.senderType === 0 ? 'user' : 'assistant',
              content: message.contents,
            }"
            :is-stream="isStreaming && index === currentMessages.length - 1"
          />
        </div>
        <div class="input-area">
          <div class="input-row">
            <el-input
              size="large"
              v-model="userInput"
              @keydown.enter.prevent="startStream(userInput, currentChatId)"
              placeholder="向CORS智能助手提问"
            />
            <el-button
              class="send-button"
              @click="startStream(userInput, currentChatId)"
              :disabled="isStreaming || !userInput.trim()"
            >
              <el-icon class="icon" size="large"><Position /></el-icon>
            </el-button>
          </div>
        </div>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup>
import {
  ChatDotSquare,
  Check,
  Close,
  More,
  Position,
} from "@element-plus/icons-vue";
import { computed, nextTick, onMounted, ref } from "vue";
import { ChatBubbleLeftRightIcon } from "@heroicons/vue/24/outline";
import ChatMessage from "../components/ChatMessage.vue";
import { chatAPI } from "../services/chat.js";
import { ElMessage, ElMessageBox } from "element-plus";

defineOptions({
  name: "AIChat",
});

const messagesRef = ref(null);
const userInput = ref("");
const isStreaming = ref(false);
const currentChatId = ref(null);
const currentMessages = ref([]);
const chatHistory = ref([]);
// 是否开启自动滚动到底部（仅当用户当前在底部时为 true）
const autoScrollEnabled = ref(true);

// 当前 AI 正在生成的回复
const currentResponse = ref("");
// TODO：对话的同时可以新建对话，并且不会影响到老对话的数据接收

// 分页状态（用于无限滚动加载历史消息）
const pageNum = ref(1);
const pageSize = ref(10);
const total = ref(0);
const loadingMore = ref(false);
const hasMore = ref(true);

// 开始新对话
function startNewChat(id) {
  if (id !== 0) {
    currentChatId.value = 0;
    currentMessages.value = [];
  } else {
    ElMessage.success("已经是最新对话！");
  }
  // 点击新对话按钮时，聚焦输入框
  const inputEl = document.querySelector(".ai-chat .el-input__inner");
  if (inputEl) {
    inputEl.focus();
  }
}

// 是否存在任一项处于编辑态
const isAnyEditing = computed(
  () =>
    Array.isArray(chatHistory.value) &&
    chatHistory.value.some((c) => c.editing !== 0),
);

// 正在提交重命名的会话ID（防重复提交）
const renamingId = ref(null);
// 保存原始标题，用于取消时恢复
const originalTitle = ref(null);

// 进入重命名（仅允许单例编辑）
async function renameSession(data) {
  if (Array.isArray(chatHistory.value)) {
    chatHistory.value.forEach((c) => {
      c.editing = 0;
    });
  }
  // 保存原始标题
  originalTitle.value = data.title || "";
  data.editing = 1;
  await nextTick();
  const inputEl =
    document.querySelector(".history-item.active .el-input__inner") ||
    document.querySelector(".history-item .el-input__inner");
  if (inputEl) {
    inputEl.focus();
  }
}

// 取消重命名
function cancelRename(chat) {
  if (chat) {
    // 恢复原始标题
    chat.title = originalTitle.value || "";
    chat.editing = 0;
    originalTitle.value = null;
  }
}

// 确认提交重命名
async function confirmRename(chat) {
  if (!chat || renamingId.value) return;
  renamingId.value = chat.id;
  try {
    const response = await chatAPI.putRenameSession(chat.id, chat.title || "");
    if (response?.code === 200) {
      chat.editing = 0;
      originalTitle.value = null;
      ElMessage.success("重命名成功！");
    } else {
      ElMessage.error(`重命名失败：${response?.msg || "未知错误"}`);
    }
  } catch (e) {
    ElMessage.error("重命名失败：网络或服务器异常");
  } finally {
    renamingId.value = null;
    await loadChatHistory();
  }
}

// 删除会话
async function deleteSession(id, name) {
  ElMessageBox.confirm(`确认删除 ${name} 吗？`, "warning", {
    confirmButtonText: "确定",
    cancelButtonText: "取消",
    type: "warning",
  })
    .then(async () => {
      const response = await chatAPI.deleteDeleteSession(id);
      if (response.code === 200) {
        ElMessage({
          type: "success",
          message: `删除 ${name} 成功！`,
        });
        await loadChatHistory();
      } else {
        ElMessage({
          type: "error",
          message: `删除 ${name} 失败！请联系管理员。`,
        });
      }
    })
    .catch(() => {
      ElMessage({
        type: "info",
        message: "已取消删除",
      });
    });
}

// 加载聊天历史列表
async function loadChatHistory() {
  try {
    const response = await chatAPI.getChatHistory();
    chatHistory.value = response.data.map((item) => ({
      ...item,
      editing: 0,
    }));
    if (response.data && response.data.length > 0) {
      await loadChat(response.data[0].id);
    } else {
      startNewChat();
    }
  } catch (error) {
    console.error("加载聊天历史失败:", error);
    chatHistory.value = [];
    startNewChat();
  }
}

// 重置分页状态
function resetPagination() {
  pageNum.value = 1;
  total.value = 0;
  hasMore.value = true;
}

// 加载特定对话（首屏数据使用分页接口，按时间正序展示）
async function loadChat(chatId) {
  currentChatId.value = chatId;
  resetPagination();
  try {
    const response = await chatAPI.getChatMessagesByPage(
      chatId,
      pageNum.value,
      pageSize.value,
    );

    const pageData = response.data || {};
    const records = Array.isArray(pageData.records) ? pageData.records : [];

    // 后端按 created 倒序，这里翻转成正序显示
    currentMessages.value = [...records].reverse();
    total.value = pageData.total || 0;
    hasMore.value = pageNum.value * pageSize.value < total.value;

    await nextTick();
    // 首次加载对话时强制滚动到底部
    await scrollToBottom(true);
  } catch (error) {
    console.error("加载对话消息失败:", error);
    currentMessages.value = [];
  }
}

// 在顶部加载更多历史消息
async function loadMoreMessages() {
  if (loadingMore.value || !hasMore.value || !currentChatId.value) return;
  loadingMore.value = true;

  try {
    const container = messagesRef.value;
    const previousScrollHeight = container ? container.scrollHeight : 0;

    // 下一页（因为后端是按 created 倒序分页，第 1 页是最新的一页）
    const nextPage = pageNum.value + 1;
    const response = await chatAPI.getChatMessagesByPage(
      currentChatId.value,
      nextPage,
      pageSize.value,
    );

    const pageData = response.data || {};
    const records = Array.isArray(pageData.records) ? pageData.records : [];

    if (records.length > 0) {
      // 仍然翻转成正序，然后插入到当前消息列表前面
      const newMessages = [...records].reverse();
      currentMessages.value = [...newMessages, ...currentMessages.value];

      pageNum.value = nextPage;
      total.value = pageData.total || total.value;
      hasMore.value = pageNum.value * pageSize.value < total.value;

      await nextTick();

      // 保持用户当前可见位置（通过调整 scrollTop）
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

// 打字机效果缓冲区
const typingBuffer = ref("");
// 打字机效果定时器
let typingTimer = null;

async function startStream(data, sessionId) {
  // 取提示词：优先显式 data，其次输入框
  const prompt = (
    typeof data === "string" ? data : userInput.value || ""
  ).trim();
  if (!prompt) return;

  // 重置状态
  currentResponse.value = "";
  isStreaming.value = true;
  userInput.value = "";

  // 重置打字机缓冲和定时器
  typingBuffer.value = "";
  if (typingTimer) {
    clearInterval(typingTimer);
    typingTimer = null;
  }

  // 将用户消息加入消息区
  currentMessages.value.push({
    senderType: 0,
    contents: prompt,
  });

  // 为助手添加一条占位消息，边流边更新
  const assistantIndex = currentMessages.value.length;
  currentMessages.value.push({
    senderType: 1,
    contents: "",
  });

  // 清空输入框并滚动（发送消息时强制滚动到底部）
  if (!data) userInput.value = "";
  await scrollToBottom(true);

  // 在首次向本地临时会话发送消息时，先向后端创建真实会话
  let sid = sessionId;
  if (sid === 0) {
    try {
      const title = prompt.slice(0, 10);
      const response = await chatAPI.postCreateSession(title);

      const realId = response.data;
      currentChatId.value = realId;
      sid = realId;

      const newChat = {
        id: realId,
        title: title,
        editing: 0,
      };
      chatHistory.value = [newChat, ...chatHistory.value];
    } catch (error) {
      console.error("创建会话失败:", error);
      isStreaming.value = false;
      return;
    }
  }

  await chatAPI.sendMessage({
    message: prompt,
    sessionId: sid,
    onChunk(chunk) {
      // 将新的内容加入缓冲区，由定时器按字符输出实现打字机效果
      typingBuffer.value += chunk;

      // 如果当前没有定时器，则启动定时器
      if (!typingTimer) {
        // 启动打字机效果定时器
        typingTimer = setInterval(() => {
          if (!typingBuffer.value.length) {
            if (!isStreaming.value) {
              clearInterval(typingTimer);
              typingTimer = null;
            }
            return;
          }

          const nextChar = typingBuffer.value[0];
          typingBuffer.value = typingBuffer.value.slice(1);

          currentResponse.value += nextChar;
          const msg = currentMessages.value[assistantIndex];
          if (msg) {
            msg.contents += nextChar;
          }

          // 仅在允许自动滚动时才滚到底部，用户向上滚动时不打扰
          nextTick(() => scrollToBottom());
        }, 20); // 每 20ms 输出一个字符
      }
    },
    onFinish() {
      isStreaming.value = false;
      if (!typingBuffer.value.length && typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
      }
    },
    onError(err) {
      isStreaming.value = false;
      if (!typingBuffer.value.length && typingTimer) {
        clearInterval(typingTimer);
        typingTimer = null;
      }
      console.error("流式请求出错:", err);
    },
  });
}

// 滚动到底部
// force = true 时无视 autoScrollEnabled，强制滚动到底
async function scrollToBottom(force = false) {
  await nextTick();
  const container = messagesRef.value;
  if (!container) return;

  if (!force && !autoScrollEnabled.value) {
    return;
  }

  container.scrollTop = container.scrollHeight;
}

// 监听消息列表滚动，滚动到顶部时加载更多历史消息，并根据是否在底部切换自动滚动
function handleMessagesScroll() {
  const container = messagesRef.value;
  if (!container) return;

  const thresholdTop = 10; // 顶部 10px 以内算到顶
  const thresholdBottom = 10; // 底部 10px 以内算到底

  // 顶部加载更多
  if (!loadingMore.value && hasMore.value && container.scrollTop <= thresholdTop) {
    loadMoreMessages();
  }

  // 判断是否在底部，用于控制自动滚动
  const distanceToBottom =
    container.scrollHeight - (container.scrollTop + container.clientHeight);
  autoScrollEnabled.value = distanceToBottom <= thresholdBottom;
}

onMounted(() => {
  if (messagesRef.value) {
    messagesRef.value.addEventListener("scroll", handleMessagesScroll);
  }
  loadChatHistory();
});
</script>

<style scoped lang="scss">
.ai-chat {
  position: fixed; // 修改为固定定位
  top: 64px; // 导航栏高度
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  background: var(--el-bg-color);
  overflow: hidden; // 防止页面滚动

  .chat-container {
    flex: 1;
    display: flex;
    max-width: 1800px;
    width: 100%;
    margin: 0 auto;
    padding: 1.5rem 2rem;
    gap: 1.5rem;
    height: 100%; // 确保容器占满高度
    overflow: hidden; // 防止容器滚动
  }

  .sidebar {
    width: 300px;
    display: flex;
    flex-direction: column;
    background: var(--el-bg-color-overlay);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);

    .history-header {
      flex-shrink: 0; // 防止头部压缩
      padding: 1rem;
      display: flex;
      justify-content: space-between;
      align-items: center;

      h2 {
        font-size: 1.25rem;
      }

      .new-chat {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.5rem 1rem;
        border-radius: 0.5rem;
        background: var(--el-color-primary);
        color: var(--el-color-white, #fff);
        border: none;
        cursor: pointer;
        transition: background-color 0.3s;

        &:hover {
          background: var(--el-color-primary-dark-2);
        }

        .icon {
          width: 1.25rem;
          height: 1.25rem;
        }
      }
    }

    .history-list {
      flex: 1;
      overflow-y: auto; // 允许历史记录滚动
      padding: 0 1rem 1rem;

      .history-item {
        min-height: 48px;
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem;
        border-radius: 0.5rem;
        cursor: pointer;
        transition: background-color 0.3s;

        &:hover {
          background: var(--el-fill-color);
        }

        &.active {
          background: color-mix(
            in srgb,
            var(--el-color-primary) 10%,
            transparent
          );
        }

        .icon {
          width: 1.25rem;
          height: 1.25rem;
        }

        .title {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rename-editing {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 0.5rem;

          .rename-input {
            flex: 1;
            min-width: 0;
          }

          .rename-confirm-btn,
          .rename-cancel-btn {
            flex-shrink: 0;
            margin-left: 0 !important;
          }

          // 覆盖 Element Plus 默认的按钮间距
          :deep(.el-button + .el-button) {
            margin-left: 0 !important;
          }
        }

        .actions {
          margin-left: auto;
          opacity: 0;
          visibility: hidden;
          transition: opacity 0.15s ease;
        }

        &:hover .actions {
          opacity: 1;
          visibility: visible;
        }
      }
    }
  }

  .chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: var(--el-bg-color-overlay);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    overflow: hidden; // 防止内容溢出

    .messages {
      flex: 1;
      overflow-y: auto; // 只允许消息区域滚动
      padding: 2rem;
      display: flex;
      flex-direction: column;
      gap: 0.75rem;

      /* 美化滚动条，随主题变化 */
      &::-webkit-scrollbar {
        width: 8px;
        height: 8px;
      }
      &::-webkit-scrollbar-track {
        background: transparent;
      }
      &::-webkit-scrollbar-thumb {
        background: var(--el-border-color);
        border-radius: 4px;
      }
      &::-webkit-scrollbar-thumb:hover {
        background: var(--el-border-color-dark);
      }
    }

    .input-area {
      flex-shrink: 0;
      padding: 1.5rem 2rem;
      background: var(--el-bg-color-overlay);
      border-top: 1px solid var(--el-border-color);
      display: flex;
      flex-direction: column;
      gap: 1rem;

      .selected-files {
        background: var(--el-fill-color-light);
        border-radius: 0.75rem;
        padding: 0.75rem;
        border: 1px solid var(--el-border-color);

        .file-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem;
          background: var(--el-bg-color);
          border-radius: 0.5rem;
          margin-bottom: 0.75rem;
          border: 1px solid var(--el-border-color);
          transition: all 0.2s ease;

          &:last-child {
            margin-bottom: 0;
          }

          &:hover {
            background: color-mix(
              in srgb,
              var(--el-color-primary) 3%,
              transparent
            );
            border-color: color-mix(
              in srgb,
              var(--el-color-primary) 20%,
              var(--el-border-color)
            );
          }

          .file-info {
            display: flex;
            align-items: center;
            gap: 0.75rem;

            .icon {
              width: 1.5rem;
              height: 1.5rem;
              color: var(--el-color-primary);
            }

            .file-name {
              font-size: 0.875rem;
              color: var(--el-text-color-primary);
              font-weight: 500;
            }

            .file-size {
              font-size: 0.75rem;
              color: var(--el-text-color-secondary);
              background: var(--el-fill-color-light);
              padding: 0.25rem 0.5rem;
              border-radius: 1rem;
            }
          }

          .remove-btn {
            padding: 0.375rem;
            border: none;
            background: var(--el-fill-color-light);
            color: var(--el-text-color-secondary);
            cursor: pointer;
            border-radius: 0.375rem;
            transition: all 0.2s ease;

            &:hover {
              background: var(--el-color-danger);
              color: var(--el-color-white, #fff);
            }

            .icon {
              width: 1.25rem;
              height: 1.25rem;
            }
          }
        }
      }

      .input-row {
        display: flex;
        gap: 1rem;
        align-items: center;
        background: var(--el-bg-color);
        padding: 0.75rem;
        border-radius: 1rem;
        border: 1px solid var(--el-border-color);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

        // 让 el-input 占满剩余宽度
        :deep(.el-input) {
          flex: 1;
        }

        // 去掉 el-input 自己的边框和背景，只用外面的那块区域
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

        .file-upload {
          .hidden {
            display: none;
          }

          .upload-btn {
            width: 2.5rem;
            height: 2.5rem;
            display: flex;
            align-items: center;
            justify-content: center;
            border: none;
            border-radius: 0.75rem;
            background: color-mix(
              in srgb,
              var(--el-color-primary) 12%,
              transparent
            );
            color: var(--el-color-primary);
            cursor: pointer;
            transition: all 0.2s ease;

            &:hover:not(:disabled) {
              background: color-mix(
                in srgb,
                var(--el-color-primary) 20%,
                transparent
              );
            }

            &:disabled {
              opacity: 0.5;
              cursor: not-allowed;
            }

            .icon {
              width: 1.25rem;
              height: 1.25rem;
            }
          }
        }

        textarea {
          flex: 1;
          resize: none;
          border: none;
          background: transparent;
          padding: 0.75rem;
          color: inherit;
          font-family: inherit;
          font-size: 1rem;
          line-height: 1.5;
          max-height: 150px;

          &:focus {
            outline: none;
          }

          &::placeholder {
            color: var(--el-text-color-placeholder);
          }
        }

        .send-button {
          width: 2.5rem;
          height: 2.5rem;
          display: flex;
          align-items: center;
          justify-content: center;
          border: none;
          border-radius: 0.75rem;
          background: var(--el-color-primary);
          color: var(--el-color-white, #fff);
          cursor: pointer;
          transition: all 0.2s ease;

          &:hover:not(:disabled) {
            background: var(--el-color-primary-dark-2);
            transform: translateY(-1px);
          }

          &:disabled {
            background: var(--el-border-color);
            cursor: not-allowed;
          }

          .icon {
            width: 1.25rem;
            height: 1.25rem;
          }
        }
      }
    }
  }
}

@media (max-width: 768px) {
  .ai-chat {
    .chat-container {
      padding: 0;
    }

    .sidebar {
      display: none; // 在移动端隐藏侧边栏
    }

    .chat-main {
      border-radius: 0;
    }
  }
}
</style>
