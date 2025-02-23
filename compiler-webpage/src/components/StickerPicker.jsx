import React from "react";

const stickers = [
  "/stickers/sticker1.png",
  "/stickers/sticker2.png",
  "/stickers/sticker3.png",
];

const StickerPicker = ({ onSelectSticker }) => {
  return (
    <div className="grid grid-cols-3 gap-2 p-2 bg-[#252A34] rounded-lg shadow-lg">
      {stickers.map((sticker, index) => (
        <img
          key={index}
          src={sticker}
          alt={`sticker-${index}`}
          className="w-16 h-16 cursor-pointer hover:opacity-75 transition"
          onClick={() => onSelectSticker(sticker)}
        />
      ))}
    </div>
  );
};

export default StickerPicker;
