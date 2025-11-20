import { useUserStore } from "../stores/user";
import { fetchEventSource } from "@microsoft/fetch-event-source";
import { apiClient } from "./client";

const userStore = useUserStore();

export const chatAPI = {
  // 发送消息并处理流式响应
  async sendMessage({ message, sessionId, onChunk, onFinish, onError }) {
    const base = window.location.origin;
    const url = new URL("/api/v1/assistant/chat", base);

    if (sessionId) {
      url.searchParams.append("session", String(sessionId));
    }

    await fetchEventSource(url, {
      method: "POST",
      headers: {
        Authorization: userStore.token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ message }),

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
  },

  // 获取聊天历史列表
  getChatHistory() {
    // 添加类型参数
    return apiClient.get("/session");
  },

  // 创建新的聊天会话
  postCreateSession(title = "新对话") {
    return apiClient.post("/session", null, {
      params: {
        title: title,
      },
    });
  },

  // 重命名聊天会话
  putRenameSession(chatId, name) {
    return apiClient.put(`/session`, null, {
      params: {
        id: chatId,
        title: name,
      },
    });
  },

  // 删除聊天会话
  deleteDeleteSession(chatId) {
    return apiClient.delete(`/session/${chatId}`);
  },

  // 获取对话聊天记录
  getChatMessages(chatId) {
    // 添加类型参数
    return apiClient.get(`/message/session/${chatId}`);
  },

  // 发送客服消息
  sendServiceMessage(prompt, chatId) {
    return apiClient.get(
      `/ai/service?prompt=${encodeURIComponent(prompt)}&chatId=${chatId}`,
    );
  },
};
