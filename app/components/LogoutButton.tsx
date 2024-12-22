import { Form } from "@remix-run/react";

export type LogoutButtonProps = {
  className?: string;
};

export function LogoutButton({ className }: LogoutButtonProps) {
  return (
    <Form method="post" action="/oauth/clear" className={className}>
      <button className="w-full h-full p-4 bg-green-300 dark:bg-green-400 font-medium text-center">
        Log Out
      </button>
    </Form>
  );
}
