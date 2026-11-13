"use client"

import * as React from "react"
import { ChevronDownIcon } from "lucide-react"
import { format } from "date-fns"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { cn } from "@/lib/utils"

interface DatePickerProps {
  id?: string
  value?: Date
  onChange?: (date: Date | undefined) => void
  placeholder?: string
  hasError?: boolean
  /** Disable dates before today (target/delivery dates in the future). */
  disablePast?: boolean
  /** Disables the trigger (e.g. a section that is locked until a step is done). */
  disabled?: boolean
  /** Merged into the trigger button (e.g. "h-9 px-3 text-sm" to match h-9 inputs). */
  className?: string
}

export function DatePicker({ id, value, onChange, placeholder, hasError, disablePast, disabled, className }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)

  const isBeforeToday = (date: Date): boolean => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    return date.getTime() < today.getTime()
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          id={id}
          disabled={disabled}
          className={cn(
            "w-full justify-between rounded-md font-normal",
            !value && "text-muted-foreground",
            hasError && "border-red-500",
            className
          )}
        >
          {value ? format(value, "PPP") : (placeholder ?? "Pick a date")}
          <ChevronDownIcon className="size-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          selected={value}
          captionLayout="dropdown"
          disabled={disablePast ? isBeforeToday : undefined}
          onSelect={(date) => {
            if (disablePast && date && isBeforeToday(date)) return
            onChange?.(date)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
