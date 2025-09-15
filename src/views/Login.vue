<template>
  <div class="login-container" :class="{ 'dark': isDark }">
    <div class="login-card">
      <div class="login-header">
        <h1 class="login-title">欢迎回来</h1>
        <p class="login-subtitle">请使用您的邮箱和密码登录</p>
      </div>
      
      <form class="login-form" @submit.prevent="handleLogin">
        <div class="form-group">
          <label for="email" class="form-label">邮箱地址</label>
          <div class="input-wrapper">
            <input
              id="email"
              v-model="loginForm.email"
              type="email"
              class="form-input"
              placeholder="请输入您的邮箱地址"
              required
            >
            <div class="input-icon">
              <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M16 12a4 4 0 10-8 0 4 4 0 008 0zm0 0v1.5a2.5 2.5 0 005 0V12a9 9 0 10-9 9m4.5-1.206a8.959 8.959 0 01-4.5 1.207"></path>
              </svg>
            </div>
          </div>
        </div>
        
        <div class="form-group">
          <label for="password" class="form-label">密码</label>
          <div class="input-wrapper">
            <input
              id="password"
              v-model="loginForm.password"
              :type="showPassword ? 'text' : 'password'"
              class="form-input"
              placeholder="请输入您的密码"
              required
            >
            <div class="input-icon">
              <svg class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"></path>
              </svg>
            </div>
            <button
              type="button"
              class="password-toggle"
              @click="showPassword = !showPassword"
            >
              <svg v-if="showPassword" class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21"></path>
              </svg>
              <svg v-else class="icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path>
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"></path>
              </svg>
            </button>
          </div>
        </div>
        
        <div class="form-options">
          <label class="remember-me">
            <input type="checkbox" v-model="loginForm.rememberMe" class="checkbox">
            <span class="checkbox-text">记住我</span>
          </label>
          <a href="#" class="forgot-password">忘记密码？</a>
        </div>
        
        <button type="submit" class="login-button" :disabled="isLoading">
          <span v-if="isLoading" class="loading-spinner"></span>
          <span v-else>登录</span>
        </button>
        
        <div class="login-footer">
          <p class="register-text">
            还没有账号？
            <a href="#" class="register-link" @click.prevent="handleRegister">立即注册</a>
          </p>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
// TODO: 注册功能
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useDark } from '@vueuse/core'
import { SginAPI } from '../services/user.js'
import { ElMessage } from 'element-plus'

const isDark = useDark()
const router = useRouter()

const loginForm = ref({
  email: '',
  password: '',
  rememberMe: false
})

const showPassword = ref(false)
const isLoading = ref(false)

// 登录处理函数
const handleLogin = async () => {
  if (isLoading.value) return

  isLoading.value = true

  try {
    const responseJson = await SginAPI.login(loginForm.value)

    if (responseJson.code === 200) {
      router.push('/home')

      ElMessage.success('登录成功！')

      localStorage.setItem('token', responseJson.data.token)
    }
    else {
      ElMessage.error(responseJson.msg)
    }
  } catch (error) {
    ElMessage.warning('网络错误！请联系管理员')
  } finally {
    isLoading.value = false
  }
}

// 跳转到注册页面
const handleRegister = () => {
  router.push('/register')
}
</script>

<style scoped lang="scss">
.login-container {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-color);
  padding: 2rem;
  overflow: hidden;

  .login-card {
    width: 100%;
    max-width: 420px;
    background: rgba(255, 255, 255, 0.95);
    backdrop-filter: blur(10px);
    border-radius: 1.5rem;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.1);
    padding: 3rem 2.5rem;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .login-header {
    text-align: center;
    margin-bottom: 2.5rem;

    .login-title {
      font-size: 2rem;
      font-weight: 700;
      color: #1a1a1a;
      margin: 0 0 0.5rem 0;
      background: linear-gradient(135deg, #007CF0, #00D4FF);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    .login-subtitle {
      font-size: 1rem;
      color: #666;
      margin: 0;
      font-weight: 400;
    }
  }

  .login-form {
    .form-group {
      margin-bottom: 1.5rem;

      .form-label {
        display: block;
        font-size: 0.875rem;
        font-weight: 600;
        color: #374151;
        margin-bottom: 0.5rem;
      }

      .input-wrapper {
        position: relative;
        display: flex;
        align-items: center;

        .form-input {
          width: 100%;
          padding: 1rem 1rem 1rem 3rem;
          border: 2px solid rgba(0, 0, 0, 0.1);
          border-radius: 0.75rem;
          font-size: 1rem;
          background: rgba(255, 255, 255, 0.8);
          transition: all 0.3s ease;
          outline: none;

          &:focus {
            border-color: #007CF0;
            background: rgba(255, 255, 255, 0.95);
            box-shadow: 0 0 0 3px rgba(0, 124, 240, 0.1);
          }

          &::placeholder {
            color: #9ca3af;
          }
        }

        .input-icon {
          position: absolute;
          left: 1rem;
          color: #9ca3af;
          pointer-events: none;

          .icon {
            width: 1.25rem;
            height: 1.25rem;
          }
        }

        .password-toggle {
          position: absolute;
          right: 1rem;
          background: none;
          border: none;
          color: #9ca3af;
          cursor: pointer;
          padding: 0.25rem;
          border-radius: 0.25rem;
          transition: color 0.2s ease;

          &:hover {
            color: #007CF0;
          }

          .icon {
            width: 1.25rem;
            height: 1.25rem;
          }
        }
      }
    }

    .form-options {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 2rem;

      .remember-me {
        display: flex;
        align-items: center;
        cursor: pointer;

        .checkbox {
          width: 1rem;
          height: 1rem;
          margin-right: 0.5rem;
          accent-color: #007CF0;
        }

        .checkbox-text {
          font-size: 0.875rem;
          color: #374151;
        }
      }

      .forgot-password {
        font-size: 0.875rem;
        color: #007CF0;
        text-decoration: none;
        transition: color 0.2s ease;

        &:hover {
          color: #0066cc;
        }
      }
    }

    .login-button {
      width: 100%;
      padding: 1rem;
      background: linear-gradient(135deg, #007CF0, #00D4FF);
      color: white;
      border: none;
      border-radius: 0.75rem;
      font-size: 1rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.3s ease;
      position: relative;
      overflow: hidden;

      &:hover:not(:disabled) {
        transform: translateY(-2px);
        box-shadow: 0 10px 25px rgba(0, 124, 240, 0.3);
      }

      &:active:not(:disabled) {
        transform: translateY(0);
      }

      &:disabled {
        opacity: 0.7;
        cursor: not-allowed;
        transform: none;
      }

      .loading-spinner {
        display: inline-block;
        width: 1.25rem;
        height: 1.25rem;
        border: 2px solid rgba(255, 255, 255, 0.3);
        border-radius: 50%;
        border-top-color: white;
        animation: spin 1s ease-in-out infinite;
      }
    }

    .login-footer {
      text-align: center;
      margin-top: 2rem;

      .register-text {
        font-size: 0.875rem;
        color: #666;
        margin: 0;

        .register-link {
          color: #007CF0;
          text-decoration: none;
          font-weight: 600;
          transition: color 0.2s ease;

          &:hover {
            color: #0066cc;
          }
        }
      }
    }
  }
}

.dark {
  .login-card {
    background: rgba(40, 40, 40, 0.95);
    border-color: rgba(255, 255, 255, 0.1);
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.3);
  }

  .login-header {
    .login-title {
      color: #fff;
    }

    .login-subtitle {
      color: #9ca3af;
    }
  }

  .login-form {
    .form-group {
      .form-label {
        color: #e5e7eb;
      }

      .input-wrapper {
        .form-input {
          background: rgba(255, 255, 255, 0.05);
          border-color: rgba(255, 255, 255, 0.1);
          color: #fff;

          &:focus {
            background: rgba(255, 255, 255, 0.1);
            border-color: #007CF0;
            box-shadow: 0 0 0 3px rgba(0, 124, 240, 0.2);
          }

          &::placeholder {
            color: #6b7280;
          }
        }

        .input-icon {
          color: #6b7280;
        }

        .password-toggle {
          color: #6b7280;

          &:hover {
            color: #007CF0;
          }
        }
      }
    }

    .form-options {
      .remember-me {
        .checkbox-text {
          color: #e5e7eb;
        }
      }
    }

    .login-footer {
      .register-text {
        color: #9ca3af;
      }
    }
  }
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 480px) {
  .login-container {
    padding: 1rem;

    .login-card {
      padding: 2rem 1.5rem;
    }

    .login-header {
      .login-title {
        font-size: 1.75rem;
      }
    }
  }
}
</style>