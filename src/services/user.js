import { apiClient } from "./client";

const USER_API_BASE_URL = "/user";

export const SignAPI = {
  // 用户登录
  login(loginFormValue) {
    return apiClient.post(`${USER_API_BASE_URL}/login`, {
      email: loginFormValue.email,
      password: loginFormValue.password,
    });
  },

  // 用户注册
  register(registerFormValue) {
    return apiClient.post(`${USER_API_BASE_URL}/register`, {
      email: registerFormValue.email,
      password: registerFormValue.password,
      confirmPassword: registerFormValue.confirmPassword,
    });
  },
};

export const RootAPI = {
  // 获取所有用户列表（管理员接口）
  getAllUsers(pageNum, pageSize) {
    return apiClient.get(`${USER_API_BASE_URL}/admin`, {
      params: {
        pageNum: pageNum,
        pageSize: pageSize,
      },
    });
  },

  // 删除用户（管理员接口）
  deleteUser(userId) {
    return apiClient.delete(`${USER_API_BASE_URL}/admin/${userId}`);
  },
};

export const UseAPI = {
  // 获取当前用户信息
  getUserInfo() {
    return apiClient.get(`${USER_API_BASE_URL}`);
  },
};
