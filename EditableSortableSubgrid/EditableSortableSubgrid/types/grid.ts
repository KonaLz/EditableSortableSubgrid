export interface GridColumn {
    name: string;
    title: string;
    dataType: string;
    width?: number;
    isPrimary?: boolean;
    isEditable?: boolean;
}

export interface GridRow {
    id: string;
    values: Record<string, string>;
    rawValues?: Record<string, string>;
    isDraft?: boolean;
}

export interface EditableGridProps {
    dataset: ComponentFramework.PropertyTypes.DataSet;
    webApi: ComponentFramework.WebApi;
    utils: ComponentFramework.Utility;
    navigation: ComponentFramework.Navigation;
    onSelectionChange: (ids: string[]) => void;
    language: number;
    userId: string;
    isControlDisabled: boolean;
    languageOverride?: string;
    editableColumns?: string;
    copyExcludedColumns?: string;
    sortOrderColumn?: string;
    parentLookupColumn?: string;
    parentRecordId?: string;
    parentEntityName?: string;
}
