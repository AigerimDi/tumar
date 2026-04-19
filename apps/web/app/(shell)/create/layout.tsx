export default function CreateLayout({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-[1180px] px-6 pb-32 pt-10">{children}</div>;
}
