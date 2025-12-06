import { useUserStore } from "../stores/user";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { apiClient } from "./client";

const SESSIONS_API_BASE_URL = "/sessions";

const userStore = useUserStore();

export const chatAPI = {
  // 发送消息并处理流式响应（返回用于取消的句柄）
  sendMessage({ message, sessionId, mode, onChunk, onFinish, onError }) {
    const Mode = {
      local: "local",
      online: "online",
    };

    let paramMode = mode ? Mode.online : Mode.local;

    const base = window.location.origin;
    const url = new URL(`/api/v1/assistant/${paramMode}/chat`, base);

    url.searchParams.append("sessionId", sessionId);

    const controller = new AbortController();

    const finished = fetchEventSource(url, {
      method: "POST",
      headers: {
        Authorization: userStore.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: message,
        sessionId: sessionId,
      }),
      openWhenHidden: true,
      signal: controller.signal,

      onmessage(event) {
        if (!event.data) return;
        let chunk = event.data;

        try {
          chunk = JSON.parse(event.data);
        } catch (_) {}

        if (typeof chunk !== "string") chunk = String(chunk);
        chunk = chunk.replace(/\r\n/g, "\n");
        chunk = chunk.replace(/^data:\s?/gm, "");

        onChunk && onChunk(chunk);
      },

      onclose() {
        onFinish && onFinish();
      },

      onerror(err) {
        onError && onError(err);
        // 这里可以选择要不要 throw；如不想 fetchEventSource 自动重试，就不要再 throw
      },
    });

    return {
      cancel: () => controller.abort(),
      finished,
    };
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
  getChatMessagesByPage(chatId, pageNum = 1, pageSize = 10) {
    return apiClient.get(`/messages`, {
      params: {
        sessionId: chatId,
        pageNum: pageNum,
        pageSize: pageSize,
      },
    });
  },
};
