<template>
  <div class="user-management">
    <div class="header">
      <h1>用户管理</h1>
      <button @click="loadUsers" class="refresh-btn">刷新</button>
    </div>

    <!-- 加载状态 -->
    <div v-if="loading" class="loading">
      正在加载用户列表...
    </div>

    <!-- 错误信息 -->
    <div v-if="error" class="error">
      {{ error }}
    </div>

    <!-- 用户列表 -->
    <div v-if="!loading && !error" class="user-list">
      <div class="table-container">
        <table class="user-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>邮箱</th>
              <th>用户名</th>
              <th>角色</th>
              <th>创建时间</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="user in users" :key="user.id" class="user-row">
              <td>{{ user.id }}</td>
              <td>{{ user.email }}</td>
              <td>{{ user.username || '未设置' }}</td>
              <td>
                <span :class="['role-badge', user.auth === 1 ? 'admin' : 'user']">
                  {{ user.auth === 1 ? '管理员' : '普通用户' }}
                </span>
              </td>
              <td>{{ formatDate(user.createTime) }}</td>
              <td>
                <button
                  v-if="showButton(user)"
                  @click="confirmDelete(user)"
                  class="delete-btn"
                >
                  删除
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- 分页 -->

      <div>
        <el-pagination
          v-if="!loading && pagination"
          size = "large"
          background
          layout="prev, pager, next"
          :total="pagination.total"
          :page-size="pageSize"
          :current-page="pagination.current"
          @current-change="changePage"
        />
      </div>
    </div>

    <!-- 删除确认对话框 -->
    <div v-if="showDeleteDialog" class="dialog-overlay" @click="cancelDelete">
      <div class="dialog" @click.stop>
        <h3>确认删除</h3>
        <p>确定要删除用户 "{{ selectedUser?.email }}" 吗？此操作不可撤销。</p>
        <div class="dialog-actions">
          <button @click="cancelDelete" class="cancel-btn">取消</button>
          <button @click="deleteUser" class="confirm-btn">确认删除</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {ElMessage} from "element-plus";

defineOptions({
  name: 'Root'
})

import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useDark } from '@vueuse/core'
import { RootAPI } from '../services/user.js'

// TODO：主题切换
const isDark = useDark()
const router = useRouter()

const users = ref([])
const loading = ref(false)
const error = ref(null)
const pagination = ref(null)
const currentPage = ref(1)
const pageSize = ref(10)
const showDeleteDialog = ref(false)
const selectedUser = ref(null)

// 加载用户列表
const loadUsers = async () => {
  loading.value = true
  error.value = null

  try {
    const response = await RootAPI.getAllUsers(currentPage.value, pageSize.value)

    if (response.code === 200) {
      users.value = response.data.records || []

      pagination.value = {
        current: Number(response.data.current),
        pages: Number(response.data.pages),
        total: Number(response.data.total)
      }
      console.log('分页信息:', pagination.value)

    } else {
      error.value = response.msg
      ElMessage.error(error.value)
    }
  } catch (err) {
    ElMessage.error('加载用户列表失败:', err)
    error.value = '网络错误，请检查网络连接'
  } finally {
    loading.value = false
  }
}

// 切换页面
const changePage = async (page) => {
  if (page < 1 || page > pagination.value.pages) return

  currentPage.value = page
  await loadUsers()
}

// 确认删除用户
const confirmDelete = (user) => {
  selectedUser.value = user
  showDeleteDialog.value = true
}

// 取消删除
const cancelDelete = () => {
  showDeleteDialog.value = false
  selectedUser.value = null
}

// 执行删除用户
const deleteUser = async () => {
  if (!selectedUser.value) return

  try {
    const response = await RootAPI.deleteUser(selectedUser.value.id)

    if (response.code === 200) {
      showDeleteDialog.value = false
      selectedUser.value = null
      ElMessage.success('删除成功！')
      await loadUsers()
    } else {
      ElMessage.error(response.msg)
    }
  } catch (err) {
    console.error('删除用户失败:', err)
  }
}

// 格式化日期
const formatDate = (dateString) => {
  if (!dateString) return '-'
  const date = new Date(dateString)
  return date.toLocaleString('zh-CN')
}

// 是否显示删除按钮
const showButton = (user) => {
  return user.auth === 0
}

// 组件挂载时加载数据
onMounted(() => {
  loadUsers()
})
</script>

<style scoped lang="scss">
.user-management {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 20px;

    h1 {
      color: #333;
      margin: 0;
    }

    .refresh-btn {
      background: #007bff;
      color: white;
      border: none;
      padding: 8px 16px;
      border-radius: 4px;
      cursor: pointer;

      &:hover {
        background: #0056b3;
      }
    }
  }

  .loading, .error {
    text-align: center;
    padding: 40px;
    font-size: 16px;
  }

  .error {
    color: #dc3545;
    background: #f8d7da;
    border: 1px solid #f5c6cb;
    border-radius: 4px;
  }

  .table-container {
    overflow-x: auto;
    margin-bottom: 20px;
  }

  .user-table {
    width: 100%;
    border-collapse: collapse;
    background: white;
    border-radius: 8px;
    overflow: hidden;
    box-shadow: 0 2px 4px rgba(0,0,0,0.1);

    th, td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #eee;
    }

    th {
      background: #f8f9fa;
      font-weight: 600;
      color: #495057;
    }

    .user-row {
      &:hover {
        background: #f8f9fa;
      }
    }
  }

  .role-badge {
    min-width: 64px;
    display: inline-block;
    text-align: center;
    padding: 4px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 500;

    &.admin {
      background: #883b7e;
      color: white;
    }

    &.user {
      background: #83AD50;
      color: white;
    }
  }

  .delete-btn {
    background: #dc3545;
    color: white;
    border: none;
    padding: 6px 12px;
    border-radius: 4px;
    cursor: pointer;
    font-size: 12px;

    &:hover:not(:disabled) {
      background: #c82333;
    }

    &:disabled {
      background: #6c757d;
      cursor: not-allowed;
    }
  }

  .dialog-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0,0,0,0.5);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 1000;

    .dialog {
      background: white;
      padding: 24px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      max-width: 400px;
      width: 90%;

      h3 {
        margin: 0 0 16px 0;
        color: #333;
      }

      p {
        margin: 0 0 20px 0;
        color: #666;
        line-height: 1.5;
      }

      .dialog-actions {
        display: flex;
        gap: 12px;
        justify-content: flex-end;

        .cancel-btn {
          background: #6c757d;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;

          &:hover {
            background: #5a6268;
          }
        }

        .confirm-btn {
          background: #dc3545;
          color: white;
          border: none;
          padding: 8px 16px;
          border-radius: 4px;
          cursor: pointer;

          &:hover {
            background: #c82333;
          }
        }
      }
    }
  }
}
</style>