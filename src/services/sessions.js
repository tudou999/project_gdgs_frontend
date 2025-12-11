import { useUserStore } from "../stores/user";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { apiClient } from "./client.ts";

const SESSIONS_API_BASE_URL = "/sessions";
const ASSISTANT_API_BASE_URL = "/assistant";

const BASE = window.location.origin;

const userStore = useUserStore();

export const chatAPI = {
  // 发送信息
  postMessage({ message, sessionId, mode }) {
    return apiClient.post(`${ASSISTANT_API_BASE_URL}/${mode}/chat`, {
      message: message,
      sessionId: sessionId,
    });
  },

  // 订阅 SSE 流
  subscribeChatStream({
    sessionId,
    onChunk,
    onFinish,
    onError,
    onId,
    lastChunkId,
  }) {
    const sseUrl = new URL(`/api/v1/assistant/sse/${sessionId}`, BASE);

    const controller = new AbortController();

    const finished = fetchEventSource(sseUrl, {
      method: "GET",
      headers: {
        Authorization: userStore.token,
        "Last-Chunk-ID": lastChunkId,
      },
      openWhenHidden: true,
      signal: controller.signal,

      // 处理接收到的消息
      onmessage(event) {
        if (!event.data) return;
        // 返回 chunk 及其 id
        onId(event.id);
        onChunk && onChunk(event.data);
      },

      // 连接关闭时的回调
      onclose() {
        onFinish && onFinish();
      },

      // 错误处理
      onerror(err) {
        onError && onError(err);
      },
    });

    return {
      cancel: () => controller.abort(),
      finished,
    };
  },

  // 手动停止对话
  patchStopMessage(sessionId) {
    return apiClient.patch(
      `${ASSISTANT_API_BASE_URL}${SESSIONS_API_BASE_URL}/${sessionId}`,
    );
  },

  // 获取聊天历史列表
  getChatHistory() {
    // 添加类型参数
    return apiClient.get(`${SESSIONS_API_BASE_URL}`);
  },

  // 创建新的聊天会话
  postCreateSession(title = "新对话") {
    return apiClient.post(`${SESSIONS_API_BASE_URL}`, {
      title: title,
    });
  },

  // 重命名聊天会话
  patchRenameSession(chatId, name) {
    return apiClient.patch(`${SESSIONS_API_BASE_URL}/${chatId}`, {
      title: name,
    });
  },

  // 删除聊天会话
  deleteDeleteSession(chatId) {
    return apiClient.delete(`${SESSIONS_API_BASE_URL}/${chatId}`);
  },

  // 分页获取对话聊天记录
  getChatMessagesByPage(chatId, pageNum = 1, pageSize = 10, signal = null) {
    return apiClient.get(`/messages`, {
      params: {
        sessionId: chatId,
        pageNum: pageNum,
        pageSize: pageSize,
      },
      signal: signal,
    });
  },
};
