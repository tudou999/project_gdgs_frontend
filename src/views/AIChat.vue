<template>
  <el-container class="ai-chat">
    <el-container class="chat-container">

      <!-- 侧边栏 -->
      <el-aside class="sidebar">
        <div class="history-header">
          <h2>聊天记录</h2>
          <el-button size="large"
                     @click="startNewChat()"
                     type="primary">
            <el-icon>
              <ChatDotSquare/>
            </el-icon>
            新对话
          </el-button>
        </div>
        <div class="history-list">
          <div 
            v-for="chat in chatHistory" 
            :key="chat.id"
            class="history-item"
            :class="{ 'active': currentChatId === chat.id }"
            @click="loadChat(chat.id)"
          >
            <ChatBubbleLeftRightIcon class="icon" />

            <span v-if="chat.editing === 0" class="title">
              {{ chat.title || '新对话' }}
            </span>

            <el-input v-else
                      v-model="chat.title"
                      size="default"
                      placeholder="请输入新标题"
                      clearable
                      @keydown.enter.stop.prevent="confirmRename(chat)"
                      :disabled="renamingId && renamingId !== chat.id"
                      v-click-outside="cancelAllEditing"/>

            <span class="actions">
              <el-dropdown size="large"
                           trigger="click">
                <el-button :disabled="isAnyEditing && chat.editing === 0">
                  <el-icon>
                    <More />
                  </el-icon>
                </el-button>

                <template #dropdown>
                  <el-dropdown-menu>
                    <el-dropdown-item @click="renameSession(chat)">重命名会话</el-dropdown-item>
                    <el-dropdown-item @click="deleteSession(chat.id, chat.title)">删除会话</el-dropdown-item>
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
              content: message.contents
            }"
            :is-stream="isStreaming && index === currentMessages.length - 1"
          />
        </div>
        <div class="input-area">
          <div class="input-row">
            <textarea v-model="userInput"
                      @keydown.enter.prevent="startStream"
                      placeholder="向CORS智能助手提问"
                      rows="1"
                      ref="inputRef"/>
            <button 
              class="send-button" 
              @click="startStream(userInput, currentChatId)"
              :disabled="isStreaming || (!userInput.trim())"
            >
              <PaperAirplaneIcon class="icon" />
            </button>
          </div>
        </div>
      </el-main>

    </el-container>
  </el-container>
</template>

<script setup>
import {ChatDotSquare, More} from "@element-plus/icons-vue";

defineOptions ({
  name: 'AIChat'
})

import {nextTick, onMounted, ref, computed} from 'vue'
import { ClickOutside as vClickOutside } from 'element-plus'
import {
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
} from '@heroicons/vue/24/outline'
import ChatMessage from '../components/ChatMessage.vue'
import {chatAPI} from '../services/chat.js'
import {fetchEventSource} from "@microsoft/fetch-event-source";
import { useUserStore } from '../stores/user'
import { ElMessage, ElMessageBox } from 'element-plus'

const messagesRef = ref(null)
const inputRef = ref(null)
const userInput = ref('')
const isStreaming = ref(false)
const currentChatId = ref(null)
const currentMessages = ref([])
const chatHistory = ref([])

// 当前 AI 正在生成的回复
const currentResponse = ref('')
// 取消全部编辑态（防止提交中误取消）
function cancelAllEditing() {
  if (renamingId.value) return
  if (Array.isArray(chatHistory.value)) {
    chatHistory.value.forEach(c => { c.editing = 0 })
  }
}


const userStore = useUserStore()
// 开始新对话
async function startNewChat() {
  // const newChatId = Date.now().toString()
  // currentChatId.value = newChatId
  // currentMessages.value = []
  //
  // // 添加新对话到聊天历史列表
  // const newChat = {
  //   id: newChatId,
  //   title: `对话 ${newChatId.slice(-6)}`
  // }
  // chatHistory.value = [newChat, ...chatHistory.value] // 将新对话添加到列表开头
  const response = await chatAPI.postCreateSession()
  console.log("🚀🚀🚀🚀", response)
}

// 是否存在任一项处于编辑态
const isAnyEditing = computed(() =>
  Array.isArray(chatHistory.value) && chatHistory.value.some(c => c.editing !== 0)
)

// 正在提交重命名的会话ID（防重复提交）
const renamingId = ref(null)

// 进入重命名（仅允许单例编辑）
async function renameSession(data) {
  if (Array.isArray(chatHistory.value)) {
    chatHistory.value.forEach(c => { c.editing = 0 })
  }
  data.editing = 1
  await nextTick();
  const inputEl = document.querySelector('.history-item.active .el-input__inner') || document.querySelector('.history-item .el-input__inner');
  if (inputEl) {
    inputEl.focus();
  }
}

// 确认提交重命名
async function confirmRename(chat) {
  if (!chat || renamingId.value) return
  renamingId.value = chat.id
  try {
    const response = await chatAPI.putRenameSession(chat.title || '', chat.id)
    if (response?.code === 200) {
      chat.editing = 0
      ElMessage.success('重命名成功！')
    } else {
      ElMessage.error(`重命名失败：${response?.msg || '未知错误'}`)
    }
  } catch (e) {
    ElMessage.error('重命名失败：网络或服务器异常')
  } finally {
    renamingId.value = null
  }
}

// 删除会话
async function deleteSession(id, name) {
  ElMessageBox.confirm(
      `确认删除 ${name} 吗？`,
      'warning',
      {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning',
      }
  )
      .then(() => {
        const response = chatAPI.deleteDeleteSession(id)
        if (response.code === 200) {
          ElMessage({
            type: 'success',
            message: `删除 ${name} 成功！`,
          })
        }
        else {
          ElMessage({
            type: 'error',
            message: `删除 ${name} 失败！请联系管理员。`,
          })
        }
        loadChatHistory()
      })
      .catch(() => {
        ElMessage({
          type: 'info',
          message: '已取消删除',
        })
      })
}

// 加载聊天历史列表
async function loadChatHistory() {
  try {
    const response = await chatAPI.getChatHistory()
    chatHistory.value = response.data.map(item => ({
      ...item,
      editing: 0
    }))
    if (response.data && response.data.length > 0) {
      await loadChat(response.data[0].id)
    } else {
      startNewChat()
    }
  } catch (error) {
    console.error('加载聊天历史失败:', error)
    chatHistory.value = []
    startNewChat()
  }
}

// 加载特定对话
async function loadChat(chatId) {
  currentChatId.value = chatId
  try {
    const response = await chatAPI.getChatMessages(chatId)
    currentMessages.value = response.data || []
    await scrollToBottom()
  } catch (error) {
    console.error('加载对话消息失败:', error)
    currentMessages.value = []
  }
}

// 发送消息（支持从输入框或直接参数触发）
function startStream(data, sessionId) {
  // 取提示词：优先显式 data，其次输入框
  const prompt = (typeof data === 'string' ? data : userInput.value || '').trim()
  if (!prompt) return

  // 重置状态
  currentResponse.value = ''
  isStreaming.value = true

  // 将用户消息加入消息区
  currentMessages.value.push({
    senderType: 0,
    contents: prompt
  })

  // 为助手添加一条占位消息，边流边更新
  const assistantIndex = currentMessages.value.length
  currentMessages.value.push({
    senderType: 1,
    contents: ''
  })

  // 清空输入框并滚动
  if (!data) userInput.value = ''
  scrollToBottom()

  // 组织请求 URL 与会话
  const url = new URL('http://localhost/api/v1/assistant/chat')
  const sid = sessionId || currentChatId.value
  if (sid) {
    url.searchParams.append('session', String(sid))
  }

  console.log('🚀🚀🚀🚀：信息开始发送')
  fetchEventSource(url, {
    method: 'POST',
    headers: {
      'Authorization': userStore.token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: prompt
    }),
    onmessage(event) {
      if (!event.data) return

      // 1) 解析成纯文本
      let chunk = event.data
      try {
        chunk = JSON.parse(event.data)
      } catch (_) {
        // 非 JSON 字符串，使用原始内容
      }

      // 2) 规范化换行
      if (typeof chunk !== 'string') chunk = String(chunk)
      chunk = chunk.replace(/\r\n/g, '\n')

      // 3) 去掉正文中的行首 data:
      chunk = chunk.replace(/^data:\s?/gm, '')

      // 4) 累加到响应与占位消息
      currentResponse.value += chunk
      const msg = currentMessages.value[assistantIndex]
      if (msg) {
        msg.contents += chunk
      }
      nextTick(() => scrollToBottom())
    },
    onclose() {
      isStreaming.value = false
    },
    onerror(err) {
      isStreaming.value = false
      console.error('流式请求出错:', err)
      throw err
    }
  })
}

// 自动调整输入框高度
async function adjustTextareaHeight() {
  const textarea = inputRef.value
  if (textarea) {
    textarea.style.height = 'auto'
    textarea.style.height = textarea.scrollHeight + 'px'
  }else{
    textarea.style.height = '50px'
  }
}

// 滚动到底部
async function scrollToBottom() {
  await nextTick()
  if (messagesRef.value) {
    messagesRef.value.scrollTop = messagesRef.value.scrollHeight
  }
}

onMounted(() => {
  loadChatHistory()
  adjustTextareaHeight()
})
</script>

<style scoped lang="scss">
.ai-chat {
  position: fixed;  // 修改为固定定位
  top: 64px;       // 导航栏高度
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
    height: 100%;    // 确保容器占满高度
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
      flex-shrink: 0;  // 防止头部压缩
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
      overflow-y: auto;  // 允许历史记录滚动
      padding: 0 1rem 1rem;
      
      .history-item {
        max-height: 48px;
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
          background: color-mix(in srgb, var(--el-color-primary) 10%, transparent);
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
    overflow: hidden;  // 防止内容溢出
    
    .messages {
      flex: 1;
      overflow-y: auto;  // 只允许消息区域滚动
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
            background: color-mix(in srgb, var(--el-color-primary) 3%, transparent);
            border-color: color-mix(in srgb, var(--el-color-primary) 20%, var(--el-border-color));
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
        align-items: flex-end;
        background: var(--el-bg-color);
        padding: 0.75rem;
        border-radius: 1rem;
        border: 1px solid var(--el-border-color);
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.05);

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
            background: color-mix(in srgb, var(--el-color-primary) 12%, transparent);
            color: var(--el-color-primary);
            cursor: pointer;
            transition: all 0.2s ease;
            
            &:hover:not(:disabled) {
              background: color-mix(in srgb, var(--el-color-primary) 20%, transparent);
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