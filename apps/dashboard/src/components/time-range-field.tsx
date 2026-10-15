import * as React from "react";
import {
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@lexmount.com/abyss-ui";
import { DateTimeField } from "@/components/date-time-field";
import { useI18n } from "@/hooks/use-i18n";
import type { MessageKey } from "@/i18n/messages";
import {
  isTimeRangePreset,
  timeRangePresets,
  type TimeRange,
  type TimeRangePreset,
} from "@/lib/time-range";

const presetLabelKeys = {
  any: "timeRange.any",
  "24h": "timeRange.last24Hours",
  "7d": "timeRange.last7Days",
  "30d": "timeRange.last30Days",
  custom: "timeRange.custom",
} as const satisfies Record<TimeRangePreset, MessageKey>;

interface TimeRangeFieldProps {
  value: TimeRange;
  onChange: (value: TimeRange) => void;
  /** Presets offered in the menu; defaults to every preset. */
  presets?: readonly TimeRangePreset[];
}

/**
 * Filter fields for a time range. Renders one preset select, plus start and
 * end date fields as sibling grid items while the custom preset is selected.
 * Parents mark their grid with `data-time-range` so the custom layout can
 * reserve room for the date-time inputs without wrapping.
 */
export function TimeRangeField({
  value,
  onChange,
  presets = timeRangePresets,
}: TimeRangeFieldProps) {
  const { t } = useI18n();
  const selectId = React.useId();
  const fromId = React.useId();
  const toId = React.useId();

  return (
    <>
      <div className="grid min-w-0 gap-2">
        <Label htmlFor={selectId}>{t("timeRange.label")}</Label>
        <Select
          value={value.preset}
          onValueChange={(preset) => {
            if (isTimeRangePreset(preset)) {
              onChange({ ...value, preset });
            }
          }}
        >
          <SelectTrigger id={selectId} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {presets.map((preset) => (
              <SelectItem key={preset} value={preset}>
                {t(presetLabelKeys[preset])}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {value.preset === "custom" ? (
        <>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor={fromId}>{t("common.from")}</Label>
            <DateTimeField
              id={fromId}
              value={value.from}
              onChange={(from) => onChange({ ...value, from })}
            />
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor={toId}>{t("common.to")}</Label>
            <DateTimeField
              id={toId}
              value={value.to}
              onChange={(to) => onChange({ ...value, to })}
            />
          </div>
        </>
      ) : null}
    </>
  );
}
