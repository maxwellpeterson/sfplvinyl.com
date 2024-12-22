export type AlbumRowProps = {
  cover: React.ReactNode;
  name: React.ReactNode;
  artists: React.ReactNode;
  year: React.ReactNode;
  tracks: React.ReactNode[];
  availability: React.ReactNode;
};

export function AlbumRow({
  cover,
  name,
  artists,
  year,
  tracks,
  availability,
}: AlbumRowProps) {
  return (
    <>
      <div className="flex gap-2 px-6 py-4 md:border-b">
        {cover}
        <div className="flex flex-col flex-auto">
          <div className="font-semibold text-gray-700 dark:text-white">
            {name}
          </div>
          <div>{artists}</div>
          <div>{year}</div>
        </div>
      </div>
      <div className="align-top px-6 md:py-4 md:border-b">
        <div className="md:hidden pb-1 text-xs font-bold">TOP TRACKS</div>
        <ol>
          {tracks.slice(0, 3).map((track, i) => (
            <li key={i} className="w-full">
              {track}
            </li>
          ))}
        </ol>
      </div>
      <div className="px-6 py-4 border-b">{availability}</div>
    </>
  );
}
