const BASE_URL = 'http://localhost'

export const SignAPI = {

  async login(loginFormValue) {
    const response = await fetch(`${BASE_URL}/api/v1/user/login`, {
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
    const response = await fetch(`${BASE_URL}/api/v1/user/register`, {
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
    const token = localStorage.getItem('token');
    const response = await fetch(`${BASE_URL}/api/v1/user/admin?pageNum=${pageNum}&pageSize=${pageSize}`, {
      method: 'GET',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  },

  // 删除用户（管理员接口）
  async deleteUser(userId) {
    const token = localStorage.getItem('token');
    const response = await fetch(`${BASE_URL}/api/v1/user/admin/${userId}`, {
      method: 'DELETE',
      headers: {
        'Authorization': token,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return response.json();
  }
}