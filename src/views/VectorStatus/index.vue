<template>
  <el-container class="vector-status-page">
    <el-header class="page-header">
      <div class="left-actions">
        <el-button
          type="primary"
          size="large"
          @click="goBackToFileSystem"
          round
        >
          <el-icon><ArrowLeft /></el-icon>
          返回文件
        </el-button>
        <h1 class="page-title">向量状态</h1>
      </div>
      <el-input
        v-model="searchKeyword"
        placeholder="按文件名搜索"
        clearable
        class="search-input"
        size="large"
      />
    </el-header>

    <el-main>
      <el-table
        v-loading="loading"
        size="large"
        :data="tableData"
        stripe
        style="width: 100%"
      >
        <el-table-column type="index" label="序号" width="70" align="center" />
        <el-table-column
          prop="name"
          label="文件名称"
          width="190"
          show-overflow-tooltip
          align="center"
        />
        <el-table-column
          prop="size"
          label="文件大小"
          width="120"
          align="center"
        >
          <template #default="scope">
            {{ formatFileSize(scope.row.size) }}
          </template>
        </el-table-column>
        <el-table-column prop="status" label="状态" width="130" align="center">
          <template #default="scope">
            <el-tag :type="statusTagType(scope.row.status)" size="default">
              {{ getStatusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          prop="retryCount"
          label="重试次数"
          width="90"
          align="center"
        />
        <el-table-column
          prop="created"
          label="创建时间"
          width="180"
          align="center"
        >
          <template #default="scope">
            {{ formatDate(scope.row.created) }}
          </template>
        </el-table-column>
        <el-table-column
          prop="updated"
          label="更新时间"
          width="180"
          align="center"
        >
          <template #default="scope">
            {{ formatDate(scope.row.updated) }}
          </template>
        </el-table-column>
        <el-table-column
          prop="errorMsg"
          label="错误信息"
          width="160"
          show-overflow-tooltip
          align="center"
        >
          <template #default="scope">
            <span v-if="scope.row.errorMsg" style="color: #f56c6c">
              {{ scope.row.errorMsg }}
            </span>
            <span v-else style="color: #909399">-</span>
          </template>
        </el-table-column>
      </el-table>

      <el-pagination
        class="pagination-wrapper"
        v-if="!loading && total > 0"
        size="large"
        background
        layout="total, prev, pager, next, sizes"
        :total="total"
        :page-size="pageSize"
        :page-sizes="VECTOR_STATUS_PAGE_SIZE_OPTIONS"
        :current-page="pageNum"
        @current-change="onPageChange"
        @size-change="onSizeChange"
      />
    </el-main>
  </el-container>
</template>

<script setup lang="ts">
import { ref, onMounted, watch, onBeforeUnmount } from "vue";
import { useRouter } from "vue-router";
import { ElMessage } from "element-plus";
import { ArrowLeft } from "@element-plus/icons-vue";
import { vectorAPI } from "../../services/file.ts";
import { filesize } from "filesize";
import { debounce } from "lodash-es";
import type { VectorStatusItem, VectorStatusResponse } from "./config.ts";
import {
  VECTOR_STATUS_PAGE_SIZE_DEFAULT,
  VECTOR_STATUS_PAGE_SIZE_OPTIONS,
  VECTOR_STATUS_SEARCH_DEBOUNCE,
  buildVectorStatusParams,
} from "./config.ts";

defineOptions({ name: "VectorStatus" });

const router = useRouter();
const loading = ref(false);
const tableData = ref<VectorStatusItem[]>([]);
const total = ref(0);
const pageNum = ref(1);
const pageSize = ref(VECTOR_STATUS_PAGE_SIZE_DEFAULT);
const searchKeyword = ref("");

const loadList = async () => {
  loading.value = true;
  try {
    const params = buildVectorStatusParams({
      pageNum: pageNum.value,
      pageSize: pageSize.value,
      keyword: searchKeyword.value,
    });
    const res = await vectorAPI.getVectorDBList(params);
    if (res?.code === 200 && res?.data) {
      const data = res.data as VectorStatusResponse;
      tableData.value = Array.isArray(data.records) ? data.records : [];
      total.value = Number(data.total) || 0;
      // 同步后端返回的当前页码
      if (data.current) {
        pageNum.value = Number(data.current) || 1;
      }
      // 同步后端返回的每页大小
      if (data.size) {
        pageSize.value = Number(data.size) || VECTOR_STATUS_PAGE_SIZE_DEFAULT;
      }
    } else {
      tableData.value = [];
      total.value = 0;
    }
  } catch (e) {
    console.error("加载向量状态失败", e);
    ElMessage.error("加载向量状态失败，请稍后重试");
    tableData.value = [];
    total.value = 0;
  } finally {
    loading.value = false;
  }
};

const onPageChange = (p: number) => {
  pageNum.value = p;
  loadList();
};

const onSizeChange = (size: number) => {
  pageSize.value = size;
  pageNum.value = 1;
  loadList();
};

// 防抖后的列表加载（搜索用）
const debouncedLoadList = debounce(() => {
  pageNum.value = 1;
  loadList();
}, VECTOR_STATUS_SEARCH_DEBOUNCE);

// 监听搜索关键字变化，使用防抖请求后端
watch(
  () => searchKeyword.value,
  () => {
    debouncedLoadList();
  },
);

const formatDate = (val: unknown) => {
  if (val == null || val === "") return "-";
  try {
    const date = new Date(val as string);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleString("zh-CN", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    });
  } catch {
    return "-";
  }
};

const formatFileSize = (size: unknown) => {
  if (size == null || size === "") return "-";
  try {
    const sizeNum = Number(size);
    if (isNaN(sizeNum)) return "-";
    return filesize(sizeNum, { base: 2 }) as string;
  } catch {
    return "-";
  }
};

const statusTagType = (status: unknown) => {
  const s = String(status ?? "").toUpperCase();
  if (s === "SUCCESS") return "success";
  if (s === "FAILED" || s === "ERROR") return "danger";
  if (s === "PENDING" || s === "WAITING") return "warning";
  return "info";
};

const getStatusText = (status: unknown) => {
  const s = String(status ?? "").toUpperCase();
  if (s === "SUCCESS") return "成功";
  if (s === "FAILED") return "失败";
  if (s === "PENDING") return "处理中";
  return status ? String(status) : "-";
};

const goBackToFileSystem = () => {
  router.push({ name: "FileSystem" });
};

onMounted(() => {
  loadList();
});

onBeforeUnmount(() => {
  debouncedLoadList.cancel();
});
</script>

<style scoped lang="scss">
.vector-status-page {
  padding: 20px;
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 0 0 16px 0;
  border-bottom: 1px solid var(--el-border-color-light);

  .page-title {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }
}

.left-actions {
  display: flex;
  align-items: center;
  gap: 20px;
}

.search-input {
  max-width: 260px;
}

.pagination-wrapper {
  display: flex;
  justify-content: center;
  margin-top: 20px;
}
</style>
