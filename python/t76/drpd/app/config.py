"""
Copyright (c) 2024 MTA, Inc.
"""

import configparser
import logging
import os

from t76.drpd.device.device import Device


class Config:
    def __init__(self):
        """Initialize the configuration."""

        self.config = self._load_config()

    def _load_config(self) -> configparser.ConfigParser:
        config_obj = configparser.ConfigParser()
        config_obj.read(self.config_path())

        logging.info("Loaded config from %s", self.config_path())

        return config_obj

    async def load(self, device: Device) -> None:
        """Get the configuration as a dictionary."""

        config_dict = {}

        for section in self.config.sections():
            config_dict[section] = {}
            for key, value in self.config.items(section):
                config_dict[section][key] = value

        await device.load_config(config_dict)

    async def save(self, device: Device) -> None:
        """Save the configuration to file."""

        data = await device.save_config()

        for section in data:
            if not self.config.has_section(section):
                self.config.add_section(section)
            for key in data[section]:
                self.config.set(section, key, str(data[section][key]))

        with open(self.config_path(), 'w', encoding='utf-8') as configfile:
            self.config.write(configfile)

        logging.info("Saved config to %s", self.config_path())

    @staticmethod
    def config_path() -> str:
        """Get the path to the configuration file."""

        # Use a standard location for configuration files
        # that will work on multiple operating systems.

        home_dir = os.path.expanduser("~")
        config_dir = os.path.join(home_dir, ".config", "t76")
        os.makedirs(config_dir, exist_ok=True)
        return os.path.join(config_dir, "drpd.ini")


config = Config()
