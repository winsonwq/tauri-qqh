const LoadingCard = () => {
  return (
    <div className="card bg-base-100">
      <div className="card-body">
        <div className="text-center py-8">
          <span className="loading loading-spinner loading-lg"></span>
          <p className="mt-4 text-base-content/50">加载中...</p>
        </div>
      </div>
    </div>
  );
};

export default LoadingCard;

