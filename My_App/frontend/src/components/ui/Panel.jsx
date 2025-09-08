import { Box } from "@chakra-ui/react";

export default function Panel({ children, ...props }) {
  return (
    <Box
      bg="white"
      borderWidth="1px"
      borderColor="gray.200"
      rounded="2xl"
      shadow="sm"
      p={4}
      {...props}
    >
      {children}
    </Box>
  );
}
