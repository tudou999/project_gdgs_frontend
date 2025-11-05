import { useUserStore } from '../stores/user'
import { fetchEventSource } from '@microsoft/fetch-event-source'
import { apiClient } from './client';

const userStore = useUserStore()

export const chatAPI = {

  // 发送消息并处理流式响应
  async sendMessage(message, sessionId) {
    // 构建URL
    const url = new URL('http://localhost/api/v1/assistant/chat');
    if (sessionId) url.searchParams.append('session', sessionId);

    // 使用fetchEventSource发送请求
    const response = await fetchEventSource(url, {
      method: 'POST',
      headers: {
        'Authorization': userStore.token,
        'Content-Type': 'application/json',
        // 接收事件流
        'Accept': 'text/event-stream',
      },
      body: JSON.stringify({message}),
    })
  },

  // 获取聊天历史列表
  getChatHistory() {  // 添加类型参数
    return apiClient.get('/session');
  },

  // 创建新的聊天会话
  postCreateSession() {
    return apiClient.post('/session');
  },

  // 重命名聊天会话
  putRenameSession(chatId, name) {
    return apiClient.put(`/session`, {
      param: {
        id: chatId,
        title: name
      }
    });
  },

  // 删除聊天会话
  deleteDeleteSession(chatId) {
    return apiClient.delete(`/session/${chatId}`);
  },

  // 获取对话聊天记录
  getChatMessages(chatId) {  // 添加类型参数
    return apiClient.get(`/message/session/${chatId}`);
  },

  // 发送客服消息
  sendServiceMessage(prompt, chatId) {
    return apiClient.get(`/ai/service?prompt=${encodeURIComponent(prompt)}&chatId=${chatId}`);
  }
}

