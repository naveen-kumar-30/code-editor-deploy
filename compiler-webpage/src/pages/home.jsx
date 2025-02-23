import React from "react";
import { Swiper, SwiperSlide } from "swiper/react";
import "swiper/css";
import "swiper/css/pagination";
import "swiper/css/autoplay";
import { Autoplay, Pagination } from "swiper/modules";
import { Container, Typography, Box, Button } from "@mui/material";
import { Link } from "react-router-dom";
import { styled } from "@mui/system";

// Styled Box to move pagination bullets down
const SwiperContainer = styled("div")({
  position: "relative",
  "& .swiper-pagination": {
    bottom: "10px !important", // Moves pagination bullets down by 10px
  },
});

const slides = [
  { title: "Welcome to NEXUS", subtitle: "Next-gen Collaborative Code Editor" },
  { title: "Real-Time Collaboration", subtitle: "Work with your team in real-time" },
  { title: "AI-Powered Code Optimization", subtitle: "Enhance your coding experience with AI" },
  { title: "Multi-Language Support", subtitle: "Compile and run code in 50+ languages" },
  { title: "Secure and Fast", subtitle: "Experience blazing-fast and secure coding" },
];

const Home = () => {
  return (
    <Box
      sx={{
        backgroundColor: "#121212",
        height: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Container maxWidth="md" sx={{ textAlign: "center", color: "#ffffff" }}>
        {/* Swiper with styled pagination */}
        <SwiperContainer>
          <Swiper
            modules={[Autoplay, Pagination]}
            autoplay={{ delay: 3000 }}
            pagination={{ clickable: true }}
            loop={true}
            className="w-full"
          >
            {slides.map((slide, index) => (
              <SwiperSlide key={index}>
                <Typography
                  variant="h2"
                  sx={{
                    fontWeight: "bold",
                    letterSpacing: 2,
                    textTransform: "uppercase",
                    color: "#f5f5f5",
                  }}
                >
                  {slide.title}
                </Typography>
                <Typography variant="h6" sx={{ marginTop: 1, fontSize: "1.2rem", color: "#b0bec5" }}>
                  {slide.subtitle}
                </Typography>
              </SwiperSlide>
            ))}
          </Swiper>
        </SwiperContainer>

        {/* Button placed further down */}
        <Box mt={6}> {/* Increased marginTop to move button further down */}
          <Button
            component={Link}
            to="/editor"
            variant="contained"
            sx={{
              backgroundColor: "#1976D2",
              padding: "12px 24px",
              fontSize: "1.2rem",
              borderRadius: 2,
              "&:hover": { backgroundColor: "#1258A7" },
            }}
          >
            Start Coding
          </Button>
        </Box>
      </Container>
    </Box>
  );
};

export default Home;
