const BASE_URL = 'http://localhost'

export const LoginAPI = {
  async login(loginFormValue){
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
  }
}