import { Popover, PopoverTrigger, PopoverContent, PopoverBody, Link } from "@chakra-ui/react";
import React from "react";

export default function GlossaryPopover({ term, children, description }) {
  return (
    <Popover trigger="hover" isLazy>
      <PopoverTrigger>
        <Link textDecor="underline" cursor="help">{children || term}</Link>
      </PopoverTrigger>
      <PopoverContent maxW="sm">
        <PopoverBody fontSize="sm">{description}</PopoverBody>
      </PopoverContent>
    </Popover>
  );
}
