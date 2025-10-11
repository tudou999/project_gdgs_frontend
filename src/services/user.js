import { useUserStore } from '../stores/user'

const userStore = useUserStore()
const USER_BASE_URL = 'http://localhost/api/v1/user'

export const SignAPI = {

  async login(loginFormValue) {
    const response = await fetch(`${USER_BASE_URL}/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        'email': loginFormValue.email,
        'password': loginFormValue.password
      })
    });

    return response.json();
  },

  async register(registerFormValue) {
    const response = await fetch(`${USER_BASE_URL}/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        'email': registerFormValue.email,
        'password': registerFormValue.password,
        'confirmPassword': registerFormValue.confirmPassword
      })
    });

      return response.json();
  }
}


////// 管理员额外操作 //////


export const RootAPI = {
  
  // 获取所有用户列表（管理员接口）
  async getAllUsers(pageNum, pageSize) {

    // 构建查询参数
    const params = new URLSearchParams({
      pageNum: pageNum,
      pageSize: pageSize
    });

      // 使用query传参
      const response = await fetch(`${USER_BASE_URL}/admin?${params}`, {
      method: 'GET',
      headers: {
        'Authorization': userStore.token,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  // 删除用户（管理员接口）
  // 使用路由传参
  async deleteUser(userId) {
    const response = await fetch(`${USER_BASE_URL}/admin/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': userStore.token,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }
}