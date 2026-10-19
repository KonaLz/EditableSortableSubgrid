import { GridRow } from "../types/grid";

/** Keep editor/API values separate from the labels rendered in the grid. */
export function commitScalarValue(row: GridRow, column: string, value: string, dataType: string,
    options: { value: number; label: string }[], yes: string, no: string): GridRow {
    let display = value;
    if (/optionset|picklist|choice/i.test(dataType)) {
        display = options.find((option) => String(option.value) === value)?.label ?? value;
    } else if (/twooptions|boolean/i.test(dataType)) {
        display = value === "true" ? yes : value === "false" ? no : value;
    }
    return { ...row, values: { ...row.values, [column]: display }, rawValues: { ...row.rawValues, [column]: value } };
}
