from __future__ import annotations

from dataclasses import dataclass

import numpy as np


@dataclass
class Vec2:
    x: float
    y: float

    def as_array(self) -> np.ndarray:
        return np.array([self.x, self.y], dtype=float)

    @classmethod
    def from_array(cls, arr: np.ndarray) -> "Vec2":
        return cls(float(arr[0]), float(arr[1]))


@dataclass
class Vec3:
    x: float
    y: float
    z: float

    def as_array(self) -> np.ndarray:
        return np.array([self.x, self.y, self.z], dtype=float)

    @classmethod
    def from_array(cls, arr: np.ndarray) -> "Vec3":
        return cls(float(arr[0]), float(arr[1]), float(arr[2]))


def rotate(vec: Vec2, angle_rad: float) -> Vec2:
    c = float(np.cos(angle_rad))
    s = float(np.sin(angle_rad))
    mat = np.array([[c, -s], [s, c]], dtype=float)
    res = mat @ vec.as_array()
    return Vec2.from_array(res)


def translate(vec: Vec2, dx: float, dy: float) -> Vec2:
    return Vec2(vec.x + dx, vec.y + dy)

