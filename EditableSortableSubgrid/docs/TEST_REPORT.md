# Verification notes / 验证说明

Control / 控件: **1.0.4** · Solution / 解决方案: **1.0.4.0**

## English

### Verified for 1.0.3

- Two targeted first-row regression tests passed: requesting metadata for hidden parent/order bindings and resolving an available parent ID in an empty dataset; stopping creation when parent context is absent.
- Nineteen existing metadata and copy tests passed, covering lookup targets, relationship binding, choices, read-only fields, dates, exclusions, and owner lookups.
- Manifest validation, ESLint, PCF compilation, production solution build, and unmanaged packaging succeeded. The solution build reported zero warnings and zero errors.
- The ZIP manifest was inspected: control version `1.0.3`, solution version `1.0.3.0`.
- On 2026-10-19, the project owner confirmed successful first-row creation in the target model-driven form subgrid after publishing this fix. This is user-reported runtime validation in one environment, not an automated tenant test or a claim of compatibility with every environment.

The first-row fix includes hidden bound columns in metadata requests and uses relationship definitions to obtain the parent table type and actual navigation property. It does not require manual parent ID configuration.

### Remaining coverage

The local harness does not provide real Dataverse security roles, native command bars, plugins, or business rules. Different forms/views, security roles, paging, concurrent ordering, and environment-specific rules still require validation. Automatic runtime parent context uses the undocumented `context.mode.contextInfo.entityId` field when available; host compatibility remains a limitation.

The complete repository test suite was not rerun for 1.0.3; the 21 checks listed above are the executed subset. Standard checks for subsequent releases are:

```powershell
npm run typecheck
npm run lint
npm run build
node --test
```

## 中文

### 1.0.3 已验证内容

- 2 项首行回归测试通过：请求隐藏父查找/排序绑定列的元数据，在空数据集中解析已有父 ID；缺少父上下文时停止创建。
- 19 项既有元数据和复制测试通过，覆盖查找目标表、关系绑定、选项、只读判断、日期、排除字段和所有者查找。
- Manifest 校验、ESLint、PCF 编译、生产解决方案构建及非托管打包成功；解决方案构建为 0 警告、0 错误。
- 已检查 ZIP 内的清单：控件版本 `1.0.3`、解决方案版本 `1.0.3.0`。
- 2026-10-19，使用者在发布修复后确认：目标模型驱动表单子网格已能创建首行。这是使用者在一个环境中的运行反馈，不是自动化租户测试，也不代表已验证所有环境。

首行修复包含隐藏绑定列的元数据加载，并从关系定义获取父表类型及实际导航属性。无需手动配置父记录 ID。

### 尚需验证的范围

本地 Harness 不提供真实 Dataverse 安全角色、原生命令栏、插件或业务规则。其他表单/视图、安全角色、分页、并发排序及环境特定规则仍需验证。自动获取父记录时会使用宿主提供的未公开字段 `context.mode.contextInfo.entityId`，因此仍存在宿主兼容性限制。

1.0.3 没有重跑整个仓库的测试套件；本次实际执行的是上述 21 项相关检查。后续版本可使用英文部分列出的标准检查命令。


## 1.0.4 — choice labels and draft save button / 选项显示与草稿保存按钮

Three new checks passed for separate choice labels/raw IDs, zero-valued choices on persisted rows, and Boolean labels. The two first-row regression checks and TypeScript check also passed. The save button now sizes to its text within the leading column. Visual layout and actual choice saves still require confirmation in the target application.

新增的 3 项检查覆盖显示名称与原始编号分离、已有行的零编号选项，以及布尔显示名称；均通过。2 项首行回归检查与类型检查也通过。保存按钮改为在左侧列内按文字宽度布局。实际界面和选项保存仍需在目标应用确认。

1.0.4 production solution build and packaging completed with zero warnings/errors. The ZIP control manifest reports 1.0.4 and includes the updated save-button CSS. / 1.0.4 生产解决方案构建及打包成功，0 警告、0 错误；已确认 ZIP 中控件版本为 1.0.4，并包含新的保存按钮样式。
