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
            <span class="title">{{ chat.title || '新对话' }}</span>
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
import {ChatDotSquare} from "@element-plus/icons-vue";

defineOptions ({
  name: 'AIChat'
})

import {nextTick, onMounted, ref} from 'vue'
import {
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
} from '@heroicons/vue/24/outline'
import ChatMessage from '../components/ChatMessage.vue'
import {chatAPI} from '../services/api'
import {fetchEventSource} from "@microsoft/fetch-event-source";
import { useUserStore } from '../stores/user'

const messagesRef = ref(null)
const inputRef = ref(null)
const userInput = ref('')
const isStreaming = ref(false)
const currentChatId = ref(null)
const currentMessages = ref([])
const chatHistory = ref([])

// 当前 AI 正在生成的回复
const currentResponse = ref('')

const userStore = useUserStore()
// 开始新对话
async function startNewChat() {
  const newChatId = Date.now().toString()
  currentChatId.value = newChatId
  currentMessages.value = []

  // 添加新对话到聊天历史列表
  const newChat = {
    id: newChatId,
    title: `对话 ${newChatId.slice(-6)}`
  }
  chatHistory.value = [newChat, ...chatHistory.value] // 将新对话添加到列表开头
}

// 加载聊天历史列表
async function loadChatHistory() {
  try {
    const response = await chatAPI.getChatHistory()
    chatHistory.value = response.data || []
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
  background: var(--bg-color);
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
    background: rgba(255, 255, 255, 0.95);
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
        background: #007CF0;
        color: white;
        border: none;
        cursor: pointer;
        transition: background-color 0.3s;
        
        &:hover {
          background: #0066cc;
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
        display: flex;
        align-items: center;
        gap: 0.5rem;
        padding: 0.75rem;
        border-radius: 0.5rem;
        cursor: pointer;
        transition: background-color 0.3s;
        
        &:hover {
          background: rgba(255, 255, 255, 0.1);
        }
        
        &.active {
          background: rgba(0, 124, 240, 0.1);
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
      }
    }
  }

  .chat-main {
    flex: 1;
    display: flex;
    flex-direction: column;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 1rem;
    box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);
    overflow: hidden;  // 防止内容溢出
    
    .messages {
      flex: 1;
      overflow-y: auto;  // 只允许消息区域滚动
      padding: 2rem;
    }
    
    .input-area {
      flex-shrink: 0;
      padding: 1.5rem 2rem;
      background: rgba(255, 255, 255, 0.98);
      border-top: 1px solid rgba(0, 0, 0, 0.05);
      display: flex;
      flex-direction: column;
      gap: 1rem;

      .selected-files {
        background: rgba(0, 0, 0, 0.02);
        border-radius: 0.75rem;
        padding: 0.75rem;
        border: 1px solid rgba(0, 0, 0, 0.05);
        
        .file-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.75rem;
          background: #fff;
          border-radius: 0.5rem;
          margin-bottom: 0.75rem;
          border: 1px solid rgba(0, 0, 0, 0.05);
          transition: all 0.2s ease;
          
          &:last-child {
            margin-bottom: 0;
          }
          
          &:hover {
            background: rgba(0, 124, 240, 0.02);
            border-color: rgba(0, 124, 240, 0.2);
          }
          
          .file-info {
            display: flex;
            align-items: center;
            gap: 0.75rem;
            
            .icon {
              width: 1.5rem;
              height: 1.5rem;
              color: #007CF0;
            }
            
            .file-name {
              font-size: 0.875rem;
              color: #333;
              font-weight: 500;
            }
            
            .file-size {
              font-size: 0.75rem;
              color: #666;
              background: rgba(0, 0, 0, 0.05);
              padding: 0.25rem 0.5rem;
              border-radius: 1rem;
            }
          }
          
          .remove-btn {
            padding: 0.375rem;
            border: none;
            background: rgba(0, 0, 0, 0.05);
            color: #666;
            cursor: pointer;
            border-radius: 0.375rem;
            transition: all 0.2s ease;
            
            &:hover {
              background: #ff4d4f;
              color: #fff;
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
        background: #fff;
        padding: 0.75rem;
        border-radius: 1rem;
        border: 1px solid rgba(0, 0, 0, 0.1);
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
            background: rgba(0, 124, 240, 0.1);
            color: #007CF0;
            cursor: pointer;
            transition: all 0.2s ease;
            
            &:hover:not(:disabled) {
              background: rgba(0, 124, 240, 0.2);
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
            color: #999;
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
          background: #007CF0;
          color: white;
          cursor: pointer;
          transition: all 0.2s ease;
          
          &:hover:not(:disabled) {
            background: #0066cc;
            transform: translateY(-1px);
          }
          
          &:disabled {
            background: #ccc;
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