# Copy configuration / 复制功能配置

Control version / 控件版本: `1.0.4`.

## English

In the form subgrid control properties:

1. Bind **ParentLookup** to the child-table lookup that references the current parent record. Copy is blocked if this binding is missing or the source row has no parent value.
2. The control reads the parent ID from model-driven subgrid runtime context when available, then falls back to existing rows or a unique dataset parent filter. Do not bind the parent ID to a child-table text column. The runtime context fallback is not part of the published PCF API and may vary by host version.
3. Optionally set **Columns excluded when copying** (`copyExcludedColumns`) to comma-, semicolon-, or whitespace-separated Dataverse logical names, for example `new_externalid,new_note`.
4. Publish the form/app after changing control properties.

The copy action reads the complete source row, including columns not present in the current view. It copies fields that Dataverse metadata marks valid for create and not calculated/derived. Lookup values are rebound through the actual relationship navigation property. The parent lookup is always preserved. A fresh sort value is used for the copy when a sort column is configured.

The control automatically skips the primary ID, alternate-key fields, auto-number fields, calculated/derived and read-only fields, system audit/version fields, and fields in the configured exclusion list. Unique business fields enforced by a plugin or business rule may need to be added to the exclusion list.

Files, images, and related child rows are not cloned. Dataverse may reject a copy when a required field is excluded or when a plugin/business rule rejects the payload. The status message reports the number created and the error. Successful copies are not automatically retried after a partial failure. Unsaved draft rows must be saved before copying.

Use logical names, not display labels. Metadata and create permissions are evaluated in the signed-in user's Dataverse session.

## 简体中文

在表单子网格控件属性中：

1. 将 **ParentLookup（父记录查找）** 绑定到子表中指向当前父记录的查找列。缺少此绑定，或源记录没有父记录值时，复制会停止并显示错误。
2. 控件会在可用时从模型驱动子网格运行时上下文读取父记录 ID，再回退到已有行或唯一的 Dataset 父查找筛选条件。不要将父记录 ID 绑定到子表文本列。该运行时上下文不是微软公开的 PCF API，可能随宿主版本变化。
3. 可选填写 **Columns excluded when copying（复制时排除的列）**（`copyExcludedColumns`），支持逗号、分号或空格分隔的 Dataverse 逻辑名，例如 `new_externalid,new_note`。
4. 修改控件属性后保存并发布表单/应用。

复制操作会读取源记录的完整字段，包括当前视图未显示的列。只复制 Dataverse 元数据允许创建且不是计算/派生字段的值。查找值通过实际关系导航属性重新绑定；父查找始终保留；配置了排序列时会为副本生成新的排序值。

控件自动跳过主键、备用键字段、自动编号字段、计算/派生和只读字段、系统审计/版本字段，以及用户配置的排除列。若插件或业务规则另有唯一字段要求，也应加入排除名单。

文件、图像和关联子记录不会复制。如果排除了必填字段，或插件/业务规则拒绝负载，Dataverse 可能拒绝创建。状态信息会显示成功数量和错误；部分失败时不会自动重试已成功的复制。未保存的草稿行必须先保存才能复制。

请填写逻辑名，不要填写显示名称。元数据检查和创建权限使用当前登录用户的 Dataverse 会话。
