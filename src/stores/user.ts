import { defineStore } from "pinia";
import { ref } from "vue";

export const useUserStore = defineStore('user', () => {
    // 从 localStorage 初始化 token
    const token = ref<string | null>(localStorage.getItem('token'));

    // 设置 token
    const setToken = (newToken: string | null) => {
        if (newToken) {
            localStorage.setItem('token', newToken);
            token.value = newToken;
        } else {
            token.value = null;
        }
    };

    // 清除 token
    const clearToken = () => {
        localStorage.removeItem('token');
        token.value = null;
    };

    return {token, setToken, clearToken};
});