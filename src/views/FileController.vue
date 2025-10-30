<script setup>
import { ElMessage } from "element-plus";
import { ArrowRight } from '@element-plus/icons-vue'
import { ref, watch, computed } from "vue";
import { fileAPI } from "../services/file";
import { useRoute, useRouter } from 'vue-router';

defineOptions({ name: "FileController" })

const route = useRoute()
const router = useRouter()

const fileList = ref([])
const breadcrumbTrail = ref([{ id: null, name: '全部文件' }])

// 当前路径的 ID 数组（从根到当前文件夹）
const currentPathIds = computed(() => {
  const idStr = route.query.id
  if (typeof idStr === 'string' && idStr) {
    return idStr.split(',').map(id => id.trim()).filter(Boolean)
  }
  return []
})

// 当前文件夹的 ID
const currentFolderId = computed(() => {
  return currentPathIds.value.length > 0
      ? currentPathIds.value[currentPathIds.value.length - 1]
      : null
})

// 加载面包屑和文件列表
const loadContent = async () => {
  try {
    if (currentFolderId.value === null) {
      fileList.value = await fileAPI.getFileList()
    } else {
      fileList.value = await fileAPI.getFolderList(currentFolderId.value)
    }

    const trail = [{ id: null, name: '全部文件' }]
    for (const id of currentPathIds.value) {
      const info = await fileAPI.getInformation(id)
      trail.push({ id, name: info.name })
    }
    breadcrumbTrail.value = trail
  } catch (error) {
    console.error('加载失败:', error)
    ElMessage.warning('加载失败！请联系管理员')
    await router.replace({ path: '/file' })
  }
}

// 监听路由变化（包括前进/后退/初始加载）
watch(
    () => route.query.id,
    () => loadContent(),
    { immediate: true }
)

const pushId = async (id) => {
  if (id == null) {
    await router.push({ path: '/file' })
  } else {
    const newPath = [...currentPathIds.value, id]
    await router.push({ path: '/file', query: { id: newPath.join(',') } })
  }
}

const navigateToTrail = async (index) => {
  if (index === 0) {
    await router.push({ path: '/file' })
  } else {
    // 取前 index 个 ID（因为 breadcrumbTrail[0] 是根，对应空路径）
    const targetPath = currentPathIds.value.slice(0, index)
    const idStr = targetPath.length ? targetPath.join(',') : undefined
    await router.push({
      path: '/file',
      query: idStr ? { id: idStr } : {}
    })
  }
}
</script>

<template>
  <el-container>
    <el-main>
      <!-- 面包屑 -->
      <el-breadcrumb :separator-icon="ArrowRight">
        <el-breadcrumb-item
            v-for="(item, index) in breadcrumbTrail"
            :key="`${item.id}-${index}`"
            :to="undefined"
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
        <div
            v-if="file.folder"
            class="folder-link file-name"
            role="button"
            tabindex="0"
            @click="pushId(file.id)"
            @keydown.enter="pushId(file.id)"
        >
          {{ file.name || '新对话' }}
        </div>
        <span v-else class="file-name">
          {{ file.name || '新对话' }}
        </span>
      </div>
    </el-main>
  </el-container>
</template>

<style scoped lang="scss">
/* 你的样式保持不变 */
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
  background-color: #a9c8ff;
}

.el-breadcrumb {
  padding: 16px 24px;
  background-color: #f9fafb;
  border-bottom: 1px solid #e4e7ed;
  margin-bottom: 20px;

  .el-breadcrumb__item {
    .el-breadcrumb__inner {
      color: #606266;
      font-size: 14px;
      transition: color 0.2s ease;

      &:not(.is-disabled) {
        cursor: pointer;
        color: #409eff;

        &:hover {
          color: #66b1ff;
          text-decoration: underline;
        }
      }

      &.is-disabled {
        cursor: default;
        color: #909399;
        font-weight: normal;
      }
    }

    .el-breadcrumb__separator {
      color: #c0c4cc;
      margin: 0 8px;
    }
  }
}
</style>