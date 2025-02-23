import React, { useState, useEffect } from "react";
import {
  AppBar,
  Toolbar,
  Select,
  MenuItem,
  Box,
  Typography,
  Button,
} from "@mui/material";
import RocketLaunchIcon from "@mui/icons-material/RocketLaunch";
import SmartToyIcon from "@mui/icons-material/SmartToy";
import { motion } from "framer-motion";

const languages = [
  { id: 54, name: "C++" },
  { id: 50, name: "C" },
  { id: 62, name: "Java" },
  { id: 71, name: "Python" },
  { id: 63, name: "JavaScript" },
  { id: 51, name: "C# (C-Sharp)" },
  { id: 60, name: "Go" },
  { id: 64, name: "Lua" },
  { id: 74, name: "TypeScript" },
  { id: 68, name: "PHP" },
  { id: 69, name: "Ruby" },
  { id: 70, name: "Swift" },
  { id: 73, name: "Kotlin" },
  { id: 81, name: "Rust" },
  { id: 78, name: "R" },
  { id: 79, name: "Scala" },
  { id: 72, name: "Perl" },
  { id: 80, name: "Dart" },
  { id: 65, name: "Pascal" },
  { id: 55, name: "Fortran" },
  { id: 77, name: "Bash" },
];

const themes = ["vs-dark", "light"];

const LanguageSelectorNavbar = ({ language, setLanguage, setTheme, handleRun, handleAI }) => {
  const [selectedLanguage, setSelectedLanguage] = useState(
    languages.find((lang) => lang.id === language)?.id || 63
  );
  
  useEffect(() => {
    if (languages.some((lang) => lang.id === language)) {
      setSelectedLanguage(language);
    } else {
      setSelectedLanguage(63); // Default to JavaScript
    }
  }, [language]);
  

  const handleLanguageChange = (e) => {
    const newLanguage = Number(e.target.value);
    setLanguage(newLanguage);
    setSelectedLanguage(newLanguage);
  };

  return (
    <AppBar
      position="static"
      sx={{
        background: "linear-gradient(135deg, #1E1F26, #252A34)",
        backdropFilter: "blur(15px)",
        borderBottom: "2px solid rgba(255, 255, 255, 0.1)",
        padding: "10px 20px",
        boxShadow: "0px 6px 15px rgba(0, 0, 0, 0.3)",
      }}
    >
      <Toolbar sx={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        {/* 🚀 Brand Name */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Typography
            variant="h5"
            sx={{
              fontWeight: "bold",
              background: "linear-gradient(90deg, #8A2BE2, #00FFFF)",
              WebkitBackgroundClip: "text",
              color: "transparent",
            }}
          >
            Nexus Code
          </Typography>
        </motion.div>

        {/* 🌍 Language & Theme Selectors */}
        <Box sx={{ display: "flex", alignItems: "center", gap: 3 }}>
          <Select
            value={selectedLanguage}
            onChange={handleLanguageChange}
            sx={{
              color: "white",
              background: "rgba(255, 255, 255, 0.15)",
              borderRadius: "8px",
              minWidth: "140px",
              padding: "6px",
              fontWeight: "bold",
              boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.3)",
              transition: "all 0.3s ease-in-out",
              "& .MuiOutlinedInput-notchedOutline": { border: "none" },
              "&:hover": { background: "rgba(255, 255, 255, 0.25)", transform: "scale(1.05)" },
            }}
          >
            {languages.map((lang) => (
              <MenuItem key={lang.id} value={lang.id}>
                {lang.name}
              </MenuItem>
            ))}
          </Select>

          <Select
            onChange={(e) => setTheme(e.target.value)}
            defaultValue="vs-dark"
            sx={{
              color: "white",
              background: "rgba(255, 255, 255, 0.15)",
              borderRadius: "8px",
              minWidth: "120px",
              padding: "6px",
              fontWeight: "bold",
              boxShadow: "0px 4px 10px rgba(0, 0, 0, 0.3)",
              transition: "all 0.3s ease-in-out",
              "& .MuiOutlinedInput-notchedOutline": { border: "none" },
              "&:hover": { background: "rgba(255, 255, 255, 0.25)", transform: "scale(1.05)" },
            }}
          >
            {themes.map((theme) => (
              <MenuItem key={theme} value={theme}>
                {theme}
              </MenuItem>
            ))}
          </Select>
        </Box>

        {/* 🎨 Improved Professional Buttons */}
        <Box sx={{ display: "flex", gap: 3 }}>
          <motion.div whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.95 }}>
            <Button
              onClick={handleRun}
              variant="contained"
              startIcon={<RocketLaunchIcon />}
              sx={{
                background: "linear-gradient(135deg, #8A2BE2, #FF00FF)",
                fontWeight: "bold",
                textTransform: "none",
                fontSize: "16px",
                padding: "12px 24px",
                borderRadius: "14px",
                boxShadow: "0px 8px 15px rgba(0, 0, 0, 0.4)",
                transition: "all 0.3s ease-in-out",
                "&:hover": {
                  background: "linear-gradient(135deg, #6A0DAD, #FF1493)",
                  transform: "translateY(-2px)",
                },
              }}
            >
              Run Code
            </Button>
          </motion.div>

          <motion.div whileHover={{ scale: 1.12 }} whileTap={{ scale: 0.95 }}>
            <Button
              onClick={handleAI}
              variant="contained"
              startIcon={<SmartToyIcon />}
              sx={{
                background: "linear-gradient(135deg, #20B2AA, #00FF7F)",
                fontWeight: "bold",
                textTransform: "none",
                fontSize: "16px",
                padding: "12px 24px",
                borderRadius: "14px",
                boxShadow: "0px 8px 15px rgba(0, 0, 0, 0.4)",
                transition: "all 0.3s ease-in-out",
                "&:hover": {
                  background: "linear-gradient(135deg, #008080, #32CD32)",
                  transform: "translateY(-2px)",
                },
              }}
            >
              AI Assist
            </Button>
          </motion.div>
        </Box>
      </Toolbar>
    </AppBar>
  );
};

export default LanguageSelectorNavbar;
