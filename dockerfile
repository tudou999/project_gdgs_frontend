# -------------------------------
# 构建阶段：使用 Node 构建 Vue3 前端
# -------------------------------
FROM node:22.17.1-alpine AS build-stage

WORKDIR /app

# 先复制依赖文件，利用 Docker 缓存（重要优化）
COPY package*.json ./

# 安装依赖
RUN npm install

# 再复制源码（不包括 node_modules，通过 .dockerignore 排除）
COPY . .

# 构建
RUN npm run build

# -------------------------------
# 运行阶段：使用 Nginx 提供静态资源
# -------------------------------
FROM nginx:alpine AS production-stage

COPY --from=build-stage /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
