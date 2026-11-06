// Audio-thread to message-thread mirror. The GUI must never hold an audio lock.
#pragma once
#include <array>
#include <atomic>
#include <memory>
#include <string>
#include <utility>
#include <vector>
namespace sy1 {
class UiEvents {
 public:
  using Event = std::pair<std::string, std::string>;
  static constexpr size_t capacity = 4096;
  UiEvents() : slots_(std::make_unique<std::array<Event, capacity>>()) {
    for (auto& event : *slots_) event.second.reserve(96);
  }
  // One producer: engine/audio thread. Slots retain their string capacity.
  bool push(const std::string& name, const std::string& args) {
    const size_t write = write_.load(std::memory_order_relaxed);
    if (write - read_.load(std::memory_order_acquire) == capacity) return false;
    auto& slot = (*slots_)[write % capacity];
    slot.first = name;
    slot.second = args;
    write_.store(write + 1, std::memory_order_release);
    return true;
  }
  // One consumer: JUCE message thread. Copies/allocations stay on this side.
  std::vector<Event> take() {
    const size_t read = read_.load(std::memory_order_relaxed);
    const size_t write = write_.load(std::memory_order_acquire);
    std::vector<Event> events;
    events.reserve(write - read);
    for (size_t i = read; i != write; ++i) events.push_back((*slots_)[i % capacity]);
    read_.store(write, std::memory_order_release);
    return events;
  }
 private:
  static_assert(std::atomic<size_t>::is_always_lock_free, "UI mirror indices must be lock-free");
  std::unique_ptr<std::array<Event, capacity>> slots_;
  alignas(64) std::atomic<size_t> read_{0};
  alignas(64) std::atomic<size_t> write_{0};
};
}
