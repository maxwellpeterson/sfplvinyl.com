import { AlbumRow } from "~/components/AlbumRow";
import Skeleton from "react-loading-skeleton";
import "react-loading-skeleton/dist/skeleton.css";

export function AlbumRowLoading() {
  return (
    <AlbumRow
      cover={<Skeleton width="64px" height="64px" />}
      name={<Skeleton width="75%" />}
      artists={<Skeleton width="50%" />}
      year={<Skeleton width="25%" />}
      tracks={[
        <Skeleton key={1} width="50%" />,
        <Skeleton key={2} width="40%" />,
        <Skeleton key={3} width="50%" />,
      ]}
      availability={<Skeleton />}
    />
  );
}
