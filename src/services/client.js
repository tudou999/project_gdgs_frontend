import axios from 'axios';
import { useUserStore } from "../stores/user";
import {ElMessage} from "element-plus";

const BASE_URL = 'http://localhost/api/v1';

const apiClient = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json'
  }
});

// 请求拦截器，添加认证token
apiClient.interceptors.request.use(
    (config) => {
      const { token } = useUserStore();
      if (token) config.headers.Authorization = token;
      return config;
    },
    (error) => Promise.reject(error)
);

// 响应拦截器：统一错误处理
apiClient.interceptors.response.use(
    response => response.data,
    error => {
      if (error.response?.status !== 200) ElMessage.warning('网络错误！请联系管理员')
      return Promise.reject(error);
    }
);

export default apiClient;
