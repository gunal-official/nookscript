// Auth routes share this bare layout: no app shell, just centered content.
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg px-4 py-12">
      {children}
    </div>
  );
}
