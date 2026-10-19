export function synchronizeSelection(dataset: ComponentFramework.PropertyTypes.DataSet, ids: string[]): void {
    if (typeof dataset.setSelectedRecordIds === "function") dataset.setSelectedRecordIds(ids);
}
