import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import * as ElementPlusIconsVue from '@element-plus/icons-vue'
// 引入暗黑主题
import 'element-plus/theme-chalk/dark/css-vars.css'

// 创建应用
const app = createApp(App)
const pinia = createPinia()

// 使用路由器和Element Plus
app.use(router)
app.use(ElementPlus, { size: 'small', zIndex: 3000 }) // 全局配置
app.mount('#app')
app.use(pinia)
for (const [key, component] of Object.entries(ElementPlusIconsVue)) {
  app.component(key, component)
}
