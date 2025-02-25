# 使用官方 Node.js 镜像
FROM node:18-alpine

# 设置工作目录
WORKDIR /app

# 复制 package.json 及 package-lock.json（如有）文件
COPY package*.json ./

# 安装依赖（仅安装生产依赖）
RUN npm install --production

# 复制所有项目文件到镜像中
COPY . .

# 暴露服务端口（默认 3000）
EXPOSE 3000

# 启动应用
CMD ["npm", "start"]