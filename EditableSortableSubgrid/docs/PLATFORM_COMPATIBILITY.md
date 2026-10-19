# Platform compatibility / 平台兼容性

## English

The control is built as a React 16 virtual Dataset PCF for a model-driven app form subgrid. Its manifest declares the WebAPI and Utility features and enables the dataset command bar, view selector, and quick find options. It uses Power Apps `context.webAPI`, `context.navigation`, `context.utils`, Dataset selection, and paging APIs.

The following are tenant/host dependent and must be checked in the target app:

- Whether the host renders the native subgrid command bar and which commands are configured.
- Whether each command can consume the selection synchronized by `setSelectedRecordIds`.
- Whether view layout metadata is available to the current user; column widths fall back when it is not.
- Whether metadata exposes expected choice labels, lookup targets, date behavior, and update/create capabilities.
- Whether security roles, field security, plugins, business rules, form configuration, and paging permit the operation.

Do not infer native command availability from the PCF Test Harness or a successful build. No universal Dynamics/Power Apps version compatibility matrix is claimed by this project. Validate in the actual tenant and app version.

## 简体中文

控件是面向模型驱动应用表单子网格的 React 16 虚拟 Dataset PCF。Manifest 声明 WebAPI 和 Utility 功能，并启用 Dataset 命令栏、视图选择器和快速查找选项。控件使用 Power Apps 的 `context.webAPI`、`context.navigation`、`context.utils`、Dataset 选择和分页 API。

以下行为取决于租户和宿主应用，需要在目标应用中确认：

- 宿主是否显示原生子网格命令栏，以及实际配置了哪些命令。
- 命令是否能读取 `setSelectedRecordIds` 同步的选择结果。
- 当前用户是否能读取视图列宽元数据；不能读取时控件会使用备用宽度。
- 元数据是否返回预期选项标签、查找目标、日期行为和创建/更新能力。
- 安全角色、字段安全、插件、业务规则、表单配置及分页是否允许对应操作。

不要从 Test Harness 或构建成功推断原生命令一定可用。本项目不声明适用于所有 Dynamics/Power Apps 版本。请在实际租户和应用版本中验证。
