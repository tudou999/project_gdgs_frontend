import { useUserStore } from '../stores/user'
import { fetchEventSource } from '@microsoft/fetch-event-source'

const BASE_URL = 'http://localhost'
const userStore = useUserStore()

export const chatAPI = {

  async sendMessage(data, sessionId) {
    const url = new URL(`${BASE_URL}/api/v1/assistant/chat`);
    if (sessionId) {
      url.searchParams.append('session', sessionId);
    }

    const message = data.get('prompt');

    console.debug('[SSE] 发送消息:', {
      url: url.toString(),
      sessionId,
      message: message ? `${message.substring(0, 50)}...` : message, // 避免日志过长
      timestamp: new Date().toISOString()
    });

    return new Promise((resolve, reject) => {
      const controller = new AbortController();
      const startTime = Date.now();

      console.debug('[SSE] 开始建立 SSE 连接...', { signal: controller.signal });

      fetchEventSource(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Authorization': userStore.token
        },
        body: JSON.stringify({ message }),

        // 使用 AbortSignal, 用于取消连接
        signal: controller.signal,

        async onopen(response) {
          const duration = Date.now() - startTime;
          console.debug(`[SSE] 连接打开 (耗时: ${duration}ms)`, {
            status: response.status,
            statusText: response.statusText,
            headers: Object.fromEntries(response.headers.entries()),
            url: url.toString()
          });

          if (response.ok && response.headers.get('content-type')?.includes('text/event-stream')) {
            return; // 正常，继续接收事件
          } else if (response.status >= 400 && response.status < 500 && response.status !== 429) {
            console.warn('[SSE] 客户端错误，不重试', { status: response.status });
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          } else {
            console.warn('[SSE] 服务端错误，可能重试', { status: response.status });
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
        },

        onmessage(event) {
          const eventData = event.data;

          if (eventData === '[DONE]') {
            const duration = Date.now() - startTime;
            console.debug(`[SSE] 收到结束信号 [DONE] (总耗时: ${duration}ms)`);
            controller.abort(); // 关闭连接
            resolve();
            return;
          }

          console.debug('[SSE] 收到消息:', {
            data: eventData,
            eventId: event.id,
            eventType: event.event,
            timestamp: new Date().toISOString()
          });

          // 触发自定义事件，传递数据
          window.dispatchEvent(new CustomEvent('streamData', {
            detail: { data: eventData }
          }));
        },

        onerror(err) {
          const duration = Date.now() - startTime;
          console.error(`[SSE] 连接错误 (持续时间: ${duration}ms):`, err);

          // 判断是否为 AbortError（手动取消或网络中断）
          if (err.name === 'AbortError') {
            console.debug('[SSE] 连接已中止 (AbortError)', { reason: controller.signal.reason });
            // 通常 resolve 而非 reject，表示正常结束
            resolve();
          } else {
            controller.abort(); // 确保连接关闭
            reject(err); // 抛出错误
          }
        },

        onclose() {
          const duration = Date.now() - startTime;
          console.debug(`[SSE] 连接关闭 (总耗时: ${duration}ms)`);
          // 可在此处理重连逻辑（如果需要）
          resolve(); // 正常关闭
        }
      });
    });
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

  // 发送游戏消息
  async sendGameMessage(prompt, chatId) {
    try {
      const response = await fetch(`${BASE_URL}/ai/game?prompt=${encodeURIComponent(prompt)}&chatId=${chatId}`, {
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

  // 发送 PDF 问答消息
  async sendPdfMessage(prompt, chatId) {
    try {
      const response = await fetch(`${BASE_URL}/ai/pdf/chat?prompt=${encodeURIComponent(prompt)}&chatId=${chatId}`, {
        method: 'GET',
        // 确保使用流式响应
        signal: AbortSignal.timeout(30000) // 30秒超时
      })

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`)
      }

      // 返回可读流
      return response.body.getReader()
    } catch (error) {
      console.error('API Error:', error)
      throw error
    }
  }
}

