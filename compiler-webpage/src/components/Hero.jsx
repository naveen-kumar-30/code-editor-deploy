import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/pagination";
import { Autoplay, Pagination } from "swiper/modules";

const Hero = () => {
  const slides = [
    { title: "Become a React Developer", subtitle: "Find the React job that fits your skill set" },
    { title: "React Frontend Engineer", subtitle: "Build stunning UIs with React and Tailwind CSS" },
    { title: "React Native Developer", subtitle: "Develop cross-platform mobile apps with React Native" },
    { title: "Full-Stack React Developer", subtitle: "Master both frontend and backend with MERN stack" },
    { title: "React UI/UX Engineer", subtitle: "Enhance user experience with dynamic React components" },
  ];

  return (
    <section className="bg-indigo-700 py-20 mb-4">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col items-center">
        <Swiper
          modules={[Autoplay, Pagination]}
          autoplay={{ delay: 3000 }}
          pagination={{ clickable: true }}
          loop={true}
          className="w-full text-center"
        >
          {slides.map((slide, index) => (
            <SwiperSlide key={index} className="flex flex-col items-center">
              <h1 className="text-4xl font-extrabold text-white sm:text-5xl md:text-6xl">
                {slide.title}
              </h1>
              <p className="my-4 text-xl text-white">{slide.subtitle}</p>
            </SwiperSlide>
          ))}
          {/* Pagination Dots Below the Titles */}
          <div className="mt-8">
            <div className="swiper-pagination"></div>
          </div>
        </Swiper>
      </div>
    </section>
  );
};

export default Hero;
