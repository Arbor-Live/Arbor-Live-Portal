"use client";

import { motion } from "framer-motion";
import { useFormContext } from "react-hook-form";
import { CheckIcon } from "@phosphor-icons/react";
import type { BookingRequestFormValues } from "@/lib/validations/booking-request";

type ReturningGroup = {
  groupId: string;
  groupName: string;
  sponsorType: string;
};

export function ReturningUserField({
  firstName,
  groups,
  onApplyGroup,
  onApplyPersonal,
  onApplyNewGroup,
}: {
  firstName: string;
  groups: ReturningGroup[];
  onApplyGroup: (group: ReturningGroup) => void;
  onApplyPersonal: () => void;
  onApplyNewGroup: () => void;
}) {
  const { watch, getFieldState } = useFormContext<BookingRequestFormValues>();
  const requestContext = watch("requestContext");
  const selectedGroupId = watch("invoiceGroupId");
  const error = getFieldState("requestContext").error?.message;

  return (
    <div className="space-y-3">
      <p className="text-sm">
        Welcome back, <span className="font-medium">{firstName}</span>!
      </p>
      <div className="grid gap-2">
        {groups.map((group) => {
          const selected = requestContext === "group" && selectedGroupId === group.groupId;
          return (
            <motion.button
              key={group.groupId}
              type="button"
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => onApplyGroup(group)}
              className={`flex w-full cursor-pointer items-start gap-3 rounded-md border p-3 text-left text-sm ${
                selected ? "border-primary bg-primary/5" : "hover:bg-muted/40"
              }`}
            >
              <span
                className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${
                  selected ? "border-primary bg-primary text-primary-foreground" : ""
                }`}
              >
                {selected ? <CheckIcon className="size-3" weight="bold" /> : null}
              </span>
              <span>
                <span className="block font-medium">{group.groupName}</span>
                <span className="text-xs text-muted-foreground">Group request</span>
              </span>
            </motion.button>
          );
        })}
        <motion.button
          type="button"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={onApplyPersonal}
          className={`flex w-full cursor-pointer items-start gap-3 rounded-md border p-3 text-left text-sm ${
            requestContext === "personal" ? "border-primary bg-primary/5" : "hover:bg-muted/40"
          }`}
        >
          <span className="font-medium">Personal / individual request</span>
        </motion.button>
        <motion.button
          type="button"
          whileHover={{ scale: 1.01 }}
          whileTap={{ scale: 0.98 }}
          onClick={onApplyNewGroup}
          className={`flex w-full cursor-pointer items-start gap-3 rounded-md border p-3 text-left text-sm ${
            requestContext === "new_group" ? "border-primary bg-primary/5" : "hover:bg-muted/40"
          }`}
        >
          <span className="font-medium">New organization / group</span>
        </motion.button>
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
    </div>
  );
}
