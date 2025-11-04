import { useUserStore } from '../stores/user'
import { fetchEventSource } from '@microsoft/fetch-event-source'

const BASE_URL = 'http://localhost'
const userStore = useUserStore()

export const chatAPI = {

  // 发送消息并处理流式响应
  async sendMessage(message, sessionId) {
    // 构建URL
    const url = new URL(`${BASE_URL}/api/v1/assistant/chat`);
    if (sessionId) {
      url.searchParams.append('session', sessionId);
    }

    // 使用fetchEventSource发送请求
    const response = await fetchEventSource(url, {
      method: 'POST',
      headers: {
        'Authorization': userStore.token,
        'Content-Type': 'application/json',
        // 接收事件流
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({ message }),
    })
  },

  // 获取聊天历史列表
  async getChatHistory() {  // 添加类型参数
    try {
      const response = await fetch(`${BASE_URL}/api/v1/session`, {
          method: 'GET',
          headers: {
              'Authorization': userStore.token
          }
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const result = await response.json();
      return result.data;

    } catch (error) {
      console.error('API Error:', error)
      return []
    }
  },

  // 获取特定对话的消息历史
  async getChatMessages(chatId) {  // 添加类型参数
    try {
      const response = await fetch(`${BASE_URL}/api/v1/message/session/${chatId}`, {
          method: 'GET',
          headers: {
              'Authorization': userStore.token
          }
      });
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }
      const messages = await response.json();
      return messages.data;

    } catch (error) {
      console.error('API Error:', error)
      return []
    }
  },

  // 发送客服消息
  async sendServiceMessage(prompt, chatId) {
    try {
      const response = await fetch(`${BASE_URL}/ai/service?prompt=${encodeURIComponent(prompt)}&chatId=${chatId}`, {
        method: 'GET',
      })

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`)
      }

      return response.body.getReader()
    } catch (error) {
      console.error('API Error:', error)
      throw error
    }
  },
}

