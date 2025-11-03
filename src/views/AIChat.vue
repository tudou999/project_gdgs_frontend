<template>
  <el-container class="ai-chat">
    <el-container class="chat-container">

<!--      侧边栏-->
      <el-aside class="sidebar">
        <div class="history-header">
          <h2>聊天记录</h2>
          <button class="new-chat" @click="startNewChat()">
            <PlusIcon class="icon" />
            新对话
          </button>
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

<!--      主区域-->
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
            <textarea
              v-model="userInput"
              @keydown.enter.prevent="sendMessage"
              placeholder="向CORS智能助手提问"
              rows="1"
              ref="inputRef"
            ></textarea>
            <button 
              class="send-button" 
              @click="sendMessage"
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
defineOptions ({
  name: 'AIChat'
})

import {nextTick, onMounted, ref} from 'vue'
import {
  ChatBubbleLeftRightIcon,
  PaperAirplaneIcon,
  PlusIcon,
} from '@heroicons/vue/24/outline'
import ChatMessage from '../components/ChatMessage.vue'
import {chatAPI} from '../services/api'

const messagesRef = ref(null)
const inputRef = ref(null)
const userInput = ref('')
const isStreaming = ref(false)
const currentChatId = ref(null)
const currentMessages = ref([])
const chatHistory = ref([])

// 开始新对话
const startNewChat = () => {
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

// 加载聊天历史
const loadChatHistory = async () => {
  try {
    const history = await chatAPI.getChatHistory()
    chatHistory.value = history || []
    if (history && history.length > 0) {
      await loadChat(history[0].id)
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
const loadChat = async (chatId) => {
  currentChatId.value = chatId
  try {
    currentMessages.value = await chatAPI.getChatMessages(chatId)
    await scrollToBottom()
  } catch (error) {
    console.error('加载对话消息失败:', error)
    currentMessages.value = []
  }
}

// 修改发送消息函数
const sendMessage = async () => {
  if (isStreaming.value) return
  if (!userInput.value.trim()) return

  const messageContent = userInput.value.trim()

  // 添加用户消息
  const userMessage = {
    senderType: 0,
    contents: messageContent,
    timestamp: new Date()
  }
  currentMessages.value.push(userMessage)

  // 清空输入
  userInput.value = ''
  adjustTextareaHeight()
  await scrollToBottom()

  // 准备发送数据
  const formData = new FormData()
  if (messageContent) {
    formData.append('prompt', messageContent)
  }

  // 添加助手消息占位
  const assistantMessage = {
    senderType: 1,
    contents: '',
    timestamp: new Date()
  }
  currentMessages.value.push(assistantMessage)

  console .log('发送数据:', currentMessages)
  isStreaming.value = true

  // 监听流式数据事件
  const handleStreamData = (event) => {
    const { data } = event.detail
    assistantMessage.contents += data

    // 更新消息内容
    const lastIndex = currentMessages.value.length - 1
    currentMessages.value.splice(lastIndex, 1, { ...assistantMessage })
    scrollToBottom()
  }

  // 添加事件监听器
  window.addEventListener('streamData', handleStreamData)

  try {
    await chatAPI.sendMessage(formData, currentChatId.value)
  } catch (error) {
    console.error('发送消息失败:', error)
    assistantMessage.content = '抱歉，发生了错误，请稍后重试。'
    const lastIndex = currentMessages.value.length - 1
    currentMessages.value.splice(lastIndex, 1, { ...assistantMessage })
  } finally {
    isStreaming.value = false

    // 移除事件监听器
    window.removeEventListener('streamData', handleStreamData)

    await scrollToBottom()
  }
}

// 自动调整输入框高度
const adjustTextareaHeight = () => {
  const textarea = inputRef.value
  if (textarea) {
    textarea.style.height = 'auto'
    textarea.style.height = textarea.scrollHeight + 'px'
  }else{
    textarea.style.height = '50px'
  }
}

// 滚动到底部
const scrollToBottom = async () => {
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