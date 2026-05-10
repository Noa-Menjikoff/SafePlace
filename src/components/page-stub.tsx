type PageStubProps = {
  title: string;
  description: string;
  step: string;
};

export function PageStub({ title, description, step }: PageStubProps) {
  return (
    <div className="mx-auto max-w-3xl">
      <div className="ss-card p-10 text-center">
        <span className="ss-pill-primary inline-flex">{step}</span>
        <h1 className="mt-4 text-h1">{title}</h1>
        <p className="mt-2 text-muted">{description}</p>
      </div>
    </div>
  );
}
