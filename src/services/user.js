const BASE_URL = 'http://localhost'

export const SginAPI = {

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