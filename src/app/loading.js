export default function Loading() {
  return (
    <div className="w-full h-1 fixed top-0 left-0 z-50 bg-transparent">
      <div className="h-full w-full bg-blue-500 animate-[loading_1.5s_infinite_linear]"></div>
    </div>
  );
}
