# CLAUDE.md

本文件为 Claude Code 提供项目上下文和开发指导。

## 项目概述

飞书云文档检查器插件 - 一个用于统计和分析飞书文档内容的浏览器插件。

**核心功能**：
- 文档字数统计与 Token 估算
- 块类型智能分类（友好块/问题块）
- 表格统计与快速定位
- 实时更新 UI

## 技术栈

**前端框架**：React 18.2 + TypeScript 4.9
**构建工具**：Webpack 5 + Babel
**样式方案**：Less + CSS Modules
**API 平台**：@lark-opdev/block-docs-addon-api (飞书开放平台)
**开发工具**：Prettier (代码格式化)

**TypeScript 配置**：
- 严格模式 (`strict: true`)
- JSX 转换：`react-jsx`
- 模块解析：`node16`

## 开发工作流

### 启动开发服务器
```bash
npm start
```
使用 webpack-dev-server，支持热模块替换 (HMR)。

### 生产构建
```bash
npm run build
```
生成优化的生产代码到 `dist/` 目录。

### 发布插件
```bash
npm run upload
```
执行构建后上传到飞书平台。

## 代码规范

### React 组件开发
- 使用函数组件 + Hooks
- 组件文件使用 `.tsx` 扩展名
- Props 必须定义 TypeScript 接口

### TypeScript 规范
- 所有变量和函数必须有类型注解
- 禁止使用 `any` 类型
- 启用 `strictNullChecks` 检查

### 代码格式化
项目使用 Prettier，配置文件：`.prettierrc.js`
- 保存时自动格式化
- 提交前检查代码风格

### 样式规范
- 优先使用 Less 预处理器
- 样式类命名采用 kebab-case
- 主样式文件：`src/index.css`

## 飞书 API 使用

### 块类型分类
插件将块类型分为两类：

**友好块**（适合 AI 处理）：
- 文本、标题（1-5级）、列表、引用、待办
- 代码块、分割线、图片、表格、文件

**问题块**（可能影响 AI 处理）：
- 标题（6-9级）、内嵌网页、云文档小组件
- 任务、OKR、白板、议程、AI 模板
- 降级块（无权限或已删除）

### API 调用注意事项
- 所有 API 调用通过 `@lark-opdev/block-docs-addon-api` 包
- 注意处理异步操作的错误情况
- 文档更新时需要重新获取数据

## 文件结构

```
src/
├── App.tsx          # 主应用组件（文档统计与 UI）
├── index.css        # 全局样式
├── index.html       # HTML 模板
└── index.tsx        # 应用入口
```

**主要组件说明**：
- `App.tsx`: 包含所有业务逻辑，状态管理，UI 渲染
- 组件内部处理块类型分类、统计计算、用户交互

## 版本管理

版本号在 `package.json` 中统一管理，遵循语义化版本规范（SemVer）：
- Major：不兼容的 API 修改
- Minor：向下兼容的功能性新增
- Patch：向下兼容的问题修正

## 关键注意事项

1. **版本号同步**：修改版本号只需编辑 `package.json`，Webpack 会自动注入到代码中
2. **块类型扩展**：添加新的块类型统计需修改 `App.tsx` 中的相关函数
3. **样式修改**：主要样式在 `index.css` 中，遵循现有样式类命名约定
4. **构建产物**：`dist/` 目录由 Webpack 生成，不要手动编辑

## 开发提示

- 项目使用 TypeScript strict 模式，确保类型安全
- Webpack 配置支持热更新，开发时无需手动刷新
- 飞书 API 有特定的权限要求，测试时注意权限设置
- 插件在飞书文档中运行，调试时使用浏览器开发者工具
