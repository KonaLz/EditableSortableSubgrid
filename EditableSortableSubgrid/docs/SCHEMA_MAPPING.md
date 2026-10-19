# Dataverse binding and schema checklist / Dataverse 绑定与字段清单

The control is schema-configurable. It does not ship with table-specific logical names. Configure these values on the form subgrid for the target child table.

| Control setting | Dataverse value | Required for |
|---|---|---|
| Dataset `records` | The child table and view used by the form subgrid | Rendering, selection, paging, and view column definitions |
| `SortOrder` bound property | A writable whole-number column on the child table | Persisting row order and assigning new-row/copy order |
| `ParentLookup` bound property | The child-table lookup to the current parent table | Creating child rows and preserving the parent when copying |
| Parent runtime context | Read automatically in a model-driven form subgrid when exposed by the host | Supplies the parent ID for the first child row; undocumented fallback API |
| `parentRecordId` / `parentEntityName` | Hidden legacy fallback inputs; leave unconfigured | Backward compatibility only |
| `editableColumns` | Optional comma-separated logical names of fields users may edit | Restricts editable fields; when blank, metadata determines which displayed fields are writable |
| `copyExcludedColumns` | Optional comma-separated logical names | Extra fields to omit from copied rows |

## Validation checklist

1. Confirm that the subgrid's table is the intended child table and the active view includes the columns users need.
2. Confirm `SortOrder` is an integer column, is bound to the correct field, and is valid for update/create for the user.
3. Confirm `ParentLookup` is bound to the relationship that points to the current form record. The control resolves parent ID from subgrid runtime context when available, then tries the dataset filter and existing rows. Do not bind parent ID to a child-table text column.
4. If restricting `editableColumns`, use logical names (such as `new_description`), not localized display labels. Leaving it blank delegates the initial writable-field decision to Dataverse metadata.
5. Confirm Dataverse metadata marks editable fields valid for update. Calculated, rollup, formula, auto-number, and otherwise read-only fields remain locked.
6. Verify lookup relationship targets, required fields, alternate keys, and business-rule uniqueness before enabling copy.
7. Test with each relevant security role and a non-production record before use.

The control reads metadata from Dataverse at runtime. The logical names are environment-specific, so this repository does not hard-code a specific business table mapping.

## 中文

控件按表结构配置，不内置某一张业务表的逻辑名。请在目标子表单子网格属性中配置：

| 控件属性 | Dataverse 配置 | 用途 |
|---|---|---|
| Dataset `records` | 表单子网格使用的子表和视图 | 呈现、选择、分页和视图列定义 |
| 绑定属性 `SortOrder` | 子表中可写的整数列 | 保存行顺序，以及给新行/副本分配顺序 |
| 绑定属性 `ParentLookup` | 子表中指向当前父表记录的查找列 | 创建子记录和复制时保留父记录关联 |
| 子网格运行时上下文 | 在模型驱动表单子网格中自动读取（宿主暴露时） | 为首条子记录提供父记录 ID；属于未公开的备用 API |
| `parentRecordId` / `parentEntityName` | 隐藏的旧版兼容备用输入；无需配置 | 仅用于向后兼容 |
| `editableColumns` | 可选填写允许编辑字段的逻辑名，逗号分隔 | 限制可编辑字段；留空时由元数据判断显示列中哪些可写 |
| `copyExcludedColumns` | 可选的逻辑名，逗号分隔 | 复制时额外跳过的字段 |

### 验证清单

1. 确认子网格的表和活动视图正确，并包含用户需要的列。
2. 确认 `SortOrder` 是整数列，绑定到正确字段，且当前用户对创建/更新有权限。
3. 确认 `ParentLookup` 绑定到指向当前表单记录的关系字段。组件会尝试从子网格运行时上下文读取父记录 ID，再回退到 Dataset 筛选条件和已有行；不要把父记录 ID 绑定到子表文本列。
4. 若要限制 `editableColumns`，请使用逻辑名（例如 `new_description`），不要使用本地化显示名。留空时由 Dataverse 元数据初步判断可写字段。
5. 确认 Dataverse 元数据允许编辑字段。计算、汇总、公式、自动编号和其他只读字段仍会锁定。
6. 启用复制前核对查找关系目标、必填项、备用键和业务规则唯一性。
7. 使用各安全角色和非生产记录验证。

控件在运行时从 Dataverse 读取元数据。逻辑名因环境而异，因此仓库不写死特定业务表映射。
