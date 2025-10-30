<script setup>
import { ElMessage } from "element-plus";
import { ArrowRight } from '@element-plus/icons-vue'

defineOptions({name: "Test3"})

import { onMounted, ref, watch } from "vue";
import { fileAPI } from "../services/file";
import { useRoute, useRouter } from 'vue-router';

// 路由实例
const route = useRoute()
const router = useRouter()
// 文件列表
const fileList = ref([])
// 面包屑路径栈
const breadcrumbTrail = ref([
  { id: null, name: '全部文件' }
])

const loadFileList = async () => {
  try {
    const oriFileList = await fileAPI.getFileList()
    fileList.value = oriFileList || []
  }
  catch (error){
    ElMessage.warning('加载失败！请联系管理员')
  }
}

// 将文件夹id推入路由
const pushId = async(id) => {
  try {
    await router.push({path: '/file', query: {id}})
  }
  catch (error){
    ElMessage.warning('加载失败！请联系管理员')
  }
}

// 监听id变化（用于浏览器前进后退）
watch(() => route.query.id, async (newId) => {
  if (newId == null || newId === '') {
    await loadFileList()
    breadcrumbTrail.value = [{ id: null, name: '全部文件' }]
  } else {
    const info = await fileAPI.getInformation(newId)
    const newFileList = await fileAPI.getFolderList(newId)
    fileList.value = newFileList || []
    breadcrumbTrail.value.push({ id: newId, name: info.name })
  }
}, { immediate: true })

// 点击面包屑导航
const navigateToTrail = async (index) => {
  // 保留从 0 到 index 的路径
  breadcrumbTrail.value = breadcrumbTrail.value.slice(0, index + 1)
  const target = breadcrumbTrail.value[index]
  await pushId(target.id)
}

</script>

<template>
  <el-container>
    <el-main>
      <!-- 面包屑 -->
      <el-breadcrumb :separator-icon="ArrowRight">
        <el-breadcrumb-item
            v-for="(item, index) in breadcrumbTrail"
            :key="item.id"
            @click="navigateToTrail(index)"
        >
          {{ item.name }}
        </el-breadcrumb-item>
      </el-breadcrumb>
      <div
        v-for="file in fileList"
        :key="file.id"
        class="file-item"
      >
        <button
            v-if="file.folder"
            class="folder-button"
            @click="pushId(file.id, file.name)"
        >
          {{ file.name || '新对话' }}
        </button>
        <span v-else class="file-name">
          {{ file.name || '新对话' }}
        </span>
      </div>
    </el-main>
  </el-container>
</template>

<style scoped lang="scss">
.file-item {
  padding: 10px 16px;
  margin-bottom: 8px;
  background-color: #f5f7fa;
  border-radius: 8px;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.1);
  transition: background-color 0.2s ease;
  cursor: pointer;
}

.file-item:hover {
  background-color: #e6f0ff;
}

// 面包屑容器样式
.el-breadcrumb {
  padding: 16px 24px;
  background-color: #f9fafb;
  border-bottom: 1px solid #e4e7ed;
  margin-bottom: 20px;

  // 面包屑项
  .el-breadcrumb__item {
    .el-breadcrumb__inner {
      color: #606266;
      font-size: 14px;
      transition: color 0.2s ease;

      // 可点击项（除了最后一项）显示为链接样式
      &:not(.is-disabled) {
        cursor: pointer;
        color: #409eff;

        &:hover {
          color: #66b1ff;
          text-decoration: underline;
        }
      }

      // 最后一项（当前页面）为普通文本，不可点击
      &.is-disabled {
        cursor: default;
        color: #909399;
        font-weight: normal;
      }
    }

    // 分隔符图标样式（可选微调）
    .el-breadcrumb__separator {
      color: #c0c4cc;
      margin: 0 8px;
    }
  }
}
</style>